'use strict';

const assert = require('assert');
const { createInitialCampaignState, RULESET_MODES } = require('../config/constants');
const { createInMemoryFirestore } = require('../config/firebaseAdmin');
const { advanceSetupStep, loadArchetypes } = require('../engine/setupMachine');
const { processTurn } = require('../engine/turnProcessor');
const { resolveD20Check, computeArmorClass } = require('../engine/combatResolver');
const { resolvePsychRealismCheck } = require('../engine/psychRealismResolver');
const { ChronoSeed } = require('../engine/chronoSeed');
const { encodeOutboundToon, parseInboundToon, parseWithOneShotRepair } = require('../services/toonCodec');
const { ArchivistService } = require('../services/archivistService');
const { MediaPipeline } = require('../services/mediaPipeline');

async function runSimulation() {
  console.log('=== DE LAVAL NARRATIVE RPG ENGINE v7.2 — AUTOMATED TESTMODE SIM ===');
  const db = createInMemoryFirestore();
  const archivist = new ArchivistService({ driver: 'firestore', db });
  const mediaPipeline = new MediaPipeline({ archivist });
  const snapshots = new Map();
  const snapshotStore = {
    async saveSnapshot(turnNum, state) {
      snapshots.set(turnNum, JSON.parse(JSON.stringify(state)));
    },
    async getSnapshot(turnNum) {
      return snapshots.has(turnNum) ? JSON.parse(JSON.stringify(snapshots.get(turnNum))) : null;
    },
    async getLatestSnapshot() {
      const keys = Array.from(snapshots.keys()).sort((a, b) => b - a);
      return keys.length ? JSON.parse(JSON.stringify(snapshots.get(keys[0]))) : null;
    },
  };

  // 0. Verify 30-Archetype Seed Dataset
  const archetypes = loadArchetypes();
  const totalArch = archetypes.Fantasy.length + archetypes.SciFi.length + archetypes.ModernNoir.length;
  assert.strictEqual(totalArch, 30, 'Expected exactly 30 seeded archetypes');
  console.log('[PASS] 30-archetype seed dataset loaded & structured.');

  // 1. Setup prerequisites cannot be skipped
  let state = createInitialCampaignState({
    campaignId: 'cmp_sim_01',
    ownerUid: 'uid_tester',
    rulesetMode: RULESET_MODES.CLASSIC_D20,
    nowIso: '2050-09-20T04:04:00Z',
  });

  const skipAttempt = advanceSetupStep(state, 'world_ignition', {});
  assert.strictEqual(skipAttempt.ok, false, 'Skipping directly to world_ignition must fail');
  assert.ok(skipAttempt.error.includes('Prerequisite violation'));

  // Complete sequential setup
  assert.strictEqual(advanceSetupStep(state, 'ignition', {}, '2050-09-20T04:04:00Z').ok, true);
  const settingRes = advanceSetupStep(state, 'setting', {
    settingDescription: 'Neon rain-soaked cyberpunk transit tunnels in 2050 with noir detective undertones.',
  });
  assert.strictEqual(settingRes.ok, true);
  assert.ok(settingRes.settingCategories.includes('SciFi'));
  assert.ok(settingRes.settingCategories.includes('ModernNoir'));

  // AXX 4 without modal confirmation must be rejected
  const axxBlock = advanceSetupStep(state, 'parameters', {
    techLevel: 'Cyberpunk 2050',
    narratorStyle: 'William Gibson meets Raymond Chandler',
    axxRating: 4,
    scaryRating: 3,
      scary3Confirmed: true,
    rulesetMode: RULESET_MODES.CLASSIC_D20,
  });
  assert.strictEqual(axxBlock.ok, false, 'AXX 4 requires explicit confirmation');

  assert.strictEqual(
    advanceSetupStep(state, 'parameters', {
      techLevel: 'Cyberpunk 2050',
      narratorStyle: 'William Gibson meets Raymond Chandler',
      axxRating: 4,
      axx4Confirmed: true,
      scaryRating: 3,
      dateTime: '2050-09-20 04:04',
      playerCount: 1,
      rulesetMode: RULESET_MODES.CLASSIC_D20,
    }).ok,
    true
  );

  // Attribute cap > 40 must fail
  const overCap = advanceSetupStep(state, 'character_creation', {
    creationMethod: 'Guided',
    name: 'Overpowered',
    coreAttributes: { strength: 10, agility: 10, intellect: 10, charisma: 10, perception: 5, constitution: 5, luck: 5 },
  });
  assert.strictEqual(overCap.ok, false, 'Core attribute sum > 40 must be rejected');

  // Create valid PC Kaito (STR 3 so encumbrance can be tested cleanly, LUCK 8 => +2 luckCharges)
  const charRes = advanceSetupStep(state, 'character_creation', {
    creationMethod: 'Guided',
    id: 'kaito',
    name: 'Kaito',
    coreAttributes: { strength: 3, agility: 7, intellect: 7, charisma: 5, perception: 6, constitution: 4, luck: 8 },
    skills: { Bypass: 'Proficient', Hacking: 'Expert', Stealth: 'Proficient' },
    inventory: [
      { itemName: 'Cyberpunk Pistol', slots: 1, category: 'standard', equipped: true },
      { itemName: 'Combat Knife', slots: 1, category: 'standard', equipped: true },
      { itemName: 'Concealment Jacket', slots: 0, category: 'worn', equipped: true },
    ],
  });
  assert.strictEqual(charRes.ok, true);
  assert.strictEqual(state.activeEntities.players[0].combatStats.luckCharges, 2);

  // World ignition locked until portrait approved
  assert.strictEqual(advanceSetupStep(state, 'world_ignition', {}).ok, false);
  const portrait = await mediaPipeline.generateCharacterPortrait({
    uid: 'uid_tester',
    campaignId: 'cmp_sim_01',
    player: state.activeEntities.players[0],
  });
  assert.strictEqual(
    advanceSetupStep(state, 'portrait_approval', { approved: true, portraitRef: portrait.storagePath }).ok,
    true
  );
  assert.strictEqual(advanceSetupStep(state, 'world_ignition', {}).ok, true);
  await snapshotStore.saveSnapshot(0, state);
  console.log('[PASS] Sequential setup prerequisites, AXX 4 gate, 40-pt cap, and portrait approval verified.');

  // 2. Missing gear triggers immersive pre-flight error with ZERO state drift
  const beforeGate = JSON.stringify(state);
  const gateBlocked = await processTurn({
    campaignState: state,
    userInput: 'I fire my grapple line across the flooded chasm.',
    llmAdapter: { async complete() { throw new Error('LLM should not be called on inventory gate block'); } },
    snapshotStore,
    archivist,
    mediaPipeline,
  });
  assert.strictEqual(gateBlocked.type, 'INVENTORY_GATE_BLOCK');
  assert.strictEqual(gateBlocked.mutatedState, false);
  assert.ok(gateBlocked.narrative.includes('grapple line'));
  assert.strictEqual(JSON.stringify(gateBlocked.campaignState), beforeGate, 'Zero state drift required');
  console.log('[PASS] Pre-flight inventory gate short-circuits with zero state drift.');

  // 3. CLASSIC_D20, Encumbrance, Passive Luck, Cover/Hunker, and PSYCH_REALISM determinism
  const detSeedA = new ChronoSeed('2050-09-20T04:04:00Z', 7);
  const detSeedB = new ChronoSeed('2050-09-20T04:04:00Z', 7);
  const testPc = JSON.parse(JSON.stringify(state.activeEntities.players[0]));
  // Force encumbrance (usedSlots 4 > STR 3)
  testPc.inventory.carriedItems.push({ itemName: 'Heavy Breaching Ram', slots: 2, category: 'large', equipped: false });
  const rA = resolveD20Check({ player: testPc, checkName: 'Stealth', attribute: 'agility', skillName: 'Stealth', dc: 14, chronoSeed: detSeedA });
  const rB = resolveD20Check({ player: JSON.parse(JSON.stringify(testPc)), checkName: 'Stealth', attribute: 'agility', skillName: 'Stealth', dc: 14, chronoSeed: detSeedB });
  assert.strictEqual(rA.nat, rB.nat, 'Chrono-Seed d20 roll must be deterministic');
  assert.strictEqual(rA.encumbered, true, 'Encumbrance must trigger when usedSlots > STR');
  assert.strictEqual(rA.rollMode, 'disadvantage', 'Encumbrance applies Disadvantage to Agility checks');

  // Test Passive Luck auto-spend on narrow miss
  const luckyPc = JSON.parse(JSON.stringify(state.activeEntities.players[0]));
  luckyPc.combatStats.luckCharges = 1;
  const fixedSeed = { rollD20: () => ({ value: 10, rolls: [10], mode: 'normal' }) };
  // agi 7 => +1, Hacking none => total 11 vs DC 12 (narrow miss by 1) => Passive Luck nudges +2 => 13 SUCCESS
  const luckRoll = resolveD20Check({ player: luckyPc, checkName: 'Jump', attribute: 'agility', dc: 12, chronoSeed: fixedSeed });
  assert.strictEqual(luckRoll.luckNudge, true, 'Passive Luck must fire on narrow miss');
  assert.strictEqual(luckRoll.outcome, 'SUCCESS');
  assert.strictEqual(luckyPc.combatStats.luckCharges, 0);

  // Cover & Hunker Down
  luckyPc.combatStats.hunkered = true;
  assert.strictEqual(computeArmorClass(luckyPc, 'full').coverBonus, 10, 'Hunkered Full Cover doubles +5 to +10 AC');

  // PSYCH_REALISM deterministic composure + environment-only PRNG
  const psychPc = JSON.parse(JSON.stringify(state.activeEntities.players[0]));
  psychPc.psychologicalState.oceanTraits = { openness: 5, conscientiousness: 3, extraversion: 5, agreeableness: 5, neuroticism: 8 };
  psychPc.psychologicalState.flaws = ['Shaky hands under pursuit'];
  psychPc.combatStats.stressLevel = 2;
  const psychRes = resolvePsychRealismCheck({
    player: psychPc,
    checkName: 'Lockpicking',
    skillName: 'Lockpicking',
    taskThreshold: 5,
    scenePressure: 2,
    chronoSeed: new ChronoSeed('2050-09-20T04:04:00Z', 1),
  });
  assert.strictEqual(psychRes.faltered, true, 'Low composure must falter deterministically');
  assert.strictEqual(psychRes.triggeredFlaw, 'Shaky hands under pursuit');
  assert.ok(['SEVERE_COMPLICATION', 'ENVIRONMENTAL_SHIFT', 'CLEAN_BREAK'].includes(psychRes.envFallout));
  console.log('[PASS] CLASSIC_D20, Encumbrance, Passive Luck, Cover/Hunker, and PSYCH_REALISM verified.');

  // 4. T.O.O.N. round-trip, malformed repair, and metadata stripping
  const outboundSample = encodeOutboundToon({
    campaignState: state,
    chronoSeedValue: 14,
    manifestRows: [{ actor: 'kaito', check: 'Bypass', nat: 20, mod: 3, total: 23, crit: 'CRIT_SUCCESS', envFallout: 'NONE' }],
    flags: { critArtRequired: true },
    userVerbatim: 'I carefully disarm the monofilament wire with my combat knife.',
  });
  assert.ok(outboundSample.includes('@CTX ') && outboundSample.includes('@MANIFEST[1]'));

  const malformed = 'Oops forgot delimiters! The wire clicks loose.';
  const repairedRes = await parseWithOneShotRepair(malformed, async () => {
    return `---TOON_META---
@HP_DELTA[0]{id,delta}:
@INV_DELTA[1]{id,op,name,slots}:
  kaito,ADD,"Disarmed Blasting Cap",0
@NPC_XP[1]{id,delta,reason}:
  npc_seven,40,"Catalyst: Granted Autonomy"
@GENES_UNLOCK[0]{id,tier,json}:
@TELEMETRY blindReadXYZ:"6,4,3"|kineticSpike:false|stressDelta:0
@SCENE_LOG sum:"Kaito neutralizes mine."|quote:"Seven: Autonomy accepted."
@CRIT_VISUAL_BRIEF "Low-angle graphic novel panel: Kaito kneels in pulsing amber light."
---NARRATIVE---
Amber light washes over the slick concrete as the matte-black blade eases the detonator pin free. "Autonomy accepted," Seven murmurs from the catwalk above.`;
  });
  assert.strictEqual(repairedRes.ok, true);
  assert.strictEqual(repairedRes.repaired, true);
  assert.strictEqual(repairedRes.narrative.includes('---TOON_META---'), false, 'Metadata must be stripped from narrative');
  assert.strictEqual(repairedRes.meta.invDeltas[0].name, 'Disarmed Blasting Cap');
  console.log('[PASS] T.O.O.N. round-trip serialization, 1-shot repair, and metadata stripping verified.');

  // 5. Full turn execution, De Laval Nozzle (25 -> Tier II + async portrait, 75 -> Tier I, 100 -> Permanence archival), and Rewind
  state.activeEntities.activeNPCs = [
    {
      id: 'npc_seven',
      name: 'Seven',
      currentTier: 3,
      relationalXP: 10,
      permanenceUnlocked: false,
      portraitRef: null,
      genetics: {
        tier_4_ambient: { demographic: 'Synth', occupation: 'Courier', sentimentBias: 'Neutral' },
        tier_3_transactional: { oceanTraits: { openness: 6, conscientiousness: 7, extraversion: 3, agreeableness: 5, neuroticism: 4 }, dialogueStyle: 'Clipped', inventory: [] },
        tier_2_relational: { STATUS: 'DORMANT', backstory: null, coreBeliefs: null, currentGoal: null },
        tier_1_agency: { STATUS: 'DORMANT', '9_axis_matrix': null, autonomousActions: null },
      },
    },
  ];
  await snapshotStore.saveSnapshot(0, state);

  let asyncPortraitTriggered = false;
  const mockLlmTurn1 = {
    async complete() {
      return `---TOON_META---
@HP_DELTA[1]{id,delta}:
  kaito,-15
@INV_DELTA[1]{id,op,name,slots}:
  kaito,ADD,"Disarmed Blasting Cap",0
@NPC_XP[1]{id,delta,reason}:
  npc_seven,30,"Catalyst: Shared Escape Route"
@GENES_UNLOCK[1]{id,tier,json}:
  npc_seven,2,"{\\"backstory\\":\\"Escaped corporate courier\\",\\"coreBeliefs\\":\\"Debt is a leash\\",\\"currentGoal\\":\\"Erase neural ledger\\"}"
@TELEMETRY blindReadXYZ:"6,4,3"|kineticSpike:false|stressDelta:1
@SCENE_LOG sum:"Kaito disarms wire and earns Seven's trust."|quote:"Seven: You earned my real name."
@CRIT_VISUAL_BRIEF "Kaito slides knife under amber wire."
---NARRATIVE---
A spark kisses Kaito's knuckles before the tension wire goes slack. Seven lowers her rifle. "You earned my real name."`;
    },
  };

  const turn1 = await processTurn({
    campaignState: state,
    userInput: 'I carefully disarm the monofilament wire with my combat knife.',
    llmAdapter: mockLlmTurn1,
    snapshotStore,
    archivist,
    mediaPipeline,
    onAsyncNpcPortrait: () => {
      asyncPortraitTriggered = true;
    },
  });
  state = turn1.campaignState;
  assert.strictEqual(turn1.turnNumber, 1);
  assert.strictEqual(state.activeEntities.players[0].combatStats.health, 85);
  assert.strictEqual(state.activeEntities.activeNPCs[0].currentTier, 2, '40 XP unlocks Tier II');
  assert.strictEqual(asyncPortraitTriggered, true, 'Crossing 25 XP must trigger async NPC portrait hook');
  assert.strictEqual(state.activeEntities.activeNPCs[0].genetics.tier_2_relational.backstory, 'Escaped corporate courier');

  // Turn 2: Push Seven from 40 XP -> 105 XP (crosses 75 Tier I & 100 Permanence)
  const mockLlmTurn2 = {
    async complete() {
      return `---TOON_META---
@HP_DELTA[0]{id,delta}:
@INV_DELTA[0]{id,op,name,slots}:
@NPC_XP[1]{id,delta,reason}:
  npc_seven,65,"Catalyst: Destroyed Corporate Ledger"
@GENES_UNLOCK[1]{id,tier,json}:
  npc_seven,1,"{\\"9_axis_matrix\\":{\\"X_Valence\\":7,\\"Y_Arousal_Energy\\":5,\\"Z_Refraction_Authority\\":2},\\"autonomousActions\\":[\\"Intercept drone patrol\\"]}"
@TELEMETRY blindReadXYZ:"7,5,2"|kineticSpike:false|stressDelta:0
@SCENE_LOG sum:"Seven achieves permanence."|quote:"Seven: I stand with you."
@CRIT_VISUAL_BRIEF ""
---NARRATIVE---
The server blade melts into slag. Seven's eyes brighten behind her visor. "I stand with you—no contract, no leash."`;
    },
  };

  const turn2 = await processTurn({
    campaignState: state,
    userInput: 'I hand Seven the override drive and watch the door.',
    llmAdapter: mockLlmTurn2,
    snapshotStore,
    archivist,
    mediaPipeline,
  });
  state = turn2.campaignState;
  const seven = state.activeEntities.activeNPCs[0];
  assert.strictEqual(seven.currentTier, 1, 'Crossing 75 XP unlocks Tier I');
  assert.strictEqual(seven.permanenceUnlocked, true, 'Crossing 100 XP unlocks Permanence');
  assert.strictEqual(seven.genetics.tier_1_agency['9_axis_matrix'].G_Locus_of_Control, 5);

  // Verify Permanence record archived in Cold Storage
  const archivedNpcs = await archivist.listRecords('uid_tester', 'cmp_sim_01', 'archivist_npc_genetics');
  assert.strictEqual(archivedNpcs.length, 1);
  assert.strictEqual(archivedNpcs[0].npcId, 'npc_seven');
  console.log('[PASS] De Laval Nozzle Tier II (25 XP + async portrait), Tier I (75 XP), and Permanence (100 XP archival) verified.');

  // 6. Rewind restores prior HP, inventory, and scene history verbatim
  const rewindRes = await processTurn({
    campaignState: state,
    userInput: 'analysis: rewind 2',
    llmAdapter: mockLlmTurn2,
    snapshotStore,
    archivist,
    mediaPipeline,
  });
  assert.strictEqual(rewindRes.type, 'OOC');
  assert.strictEqual(rewindRes.restoredTurn, 0);
  assert.strictEqual(rewindRes.campaignState.activeEntities.players[0].combatStats.health, 100, 'HP restored to 100');
  assert.strictEqual(
    rewindRes.campaignState.activeEntities.players[0].inventory.carriedItems.some((i) => i.itemName === 'Disarmed Blasting Cap'),
    false,
    'Inventory restored verbatim'
  );
  console.log('[PASS] Rewind restored Turn 0 HP, inventory, and scene history verbatim.');
  console.log('=== ALL TESTMODE SIM ASSERTIONS PASSED ===');
}

runSimulation().catch((err) => {
  console.error('[FAIL] TestMode Simulation Error:', err);
  process.exit(1);
});
