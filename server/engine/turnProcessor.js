'use strict';

const {
  RULESET_MODES,
  RULE_OF_4_PREVIOUS_LIMIT,
  OFFSCREEN_BEAT_CHANCE,
} = require('../config/constants');
const { ChronoSeed } = require('./chronoSeed');
const { parseOocCommand, routeOocCommand } = require('./oocRouter');
const { validatePreFlightInventory, computeEncumbrance } = require('./inventoryGate');
const { resolveD20Check, applyTacticalAction } = require('./combatResolver');
const { resolvePsychRealismCheck } = require('./psychRealismResolver');
const {
  applyRelationalXpDeltas,
  applyGenesUnlock,
  tickEnvironmentalSwarms,
} = require('./deLavalNozzle');
const { buildNarratorSystemPrompt } = require('./narratorPrompt');
const { encodeOutboundToon, parseWithOneShotRepair } = require('../services/toonCodec');

function cloneState(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function inferCheckParameters(userInput, player) {
  const lower = String(userInput || '').toLowerCase();
  if (/(disarm|lockpick|bypass|hack|pick|splice|wire|console)/.test(lower)) {
    return { checkName: 'Bypass', attribute: 'agility', skillName: 'Hacking', dc: 13, dramaticBreakthrough: true };
  }
  if (/(sneak|stealth|hide|shadow|quiet|slip past)/.test(lower)) {
    return { checkName: 'Stealth', attribute: 'agility', skillName: 'Stealth', dc: 12, dramaticBreakthrough: true };
  }
  if (/(persuade|convince|bluff|negotiate|intimidate|lie|deceive)/.test(lower)) {
    return { checkName: 'Persuasion', attribute: 'charisma', skillName: 'Persuasion', dc: 12, dramaticBreakthrough: true };
  }
  if (/(shoot|fire|strike|attack|slash|stab|punch|tackle)/.test(lower)) {
    return { checkName: 'Combat', attribute: 'strength', skillName: 'Longsword', dc: 13, dramaticBreakthrough: true };
  }
  if (/(search|inspect|scan|investigate|track|spot|listen)/.test(lower)) {
    return { checkName: 'Perception', attribute: 'perception', skillName: 'Investigation', dc: 11, dramaticBreakthrough: false };
  }
  const firstSkill = Object.keys(player?.skills || {})[0] || null;
  return { checkName: 'Action', attribute: 'agility', skillName: firstSkill, dc: 11, dramaticBreakthrough: false };
}

/**
 * Executes a single authoritative RPG turn:
 * 1. OOC Interrupt Router
 * 2. Pre-Flight Inventory Gate (zero state mutation on missing gear)
 * 3. Deterministic Mechanics (CLASSIC_D20 or PSYCH_REALISM + Batched Ally/Swarm ticks)
 * 4. Rule of 4 Context Gating & Outbound T.O.O.N.
 * 5. LLM Call + 1-shot T.O.O.N. Repair + Metadata Stripping
 * 6. State Delta Application + De Laval Nozzle XP/Tier/Permanence + Async Portraits
 * 7. Critical Graphic-Novel Panel Generation
 * 8. Immutable Turn Snapshot Persistence
 */
async function processTurn({
  campaignState,
  userInput,
  tacticalAction = null,
  timestamp = new Date(),
  llmAdapter,
  snapshotStore = null,
  archivist = null,
  mediaPipeline = null,
  saveHandler = null,
  onAsyncNpcPortrait = null,
}) {
  const chrono = new ChronoSeed(timestamp, campaignState.metaData?.turnNumber || 0);
  const workingState = cloneState(campaignState);

  // Step 1: OOC Interrupt Router
  const parsedOoc = parseOocCommand(userInput);
  let travelContext = null;
  if (parsedOoc) {
    const oocResult = await routeOocCommand({
      parsed: parsedOoc,
      campaignState: workingState,
      chronoSeed: chrono,
      snapshotStore,
      mediaPipeline,
      saveHandler,
    });
    if (oocResult && oocResult.handled) {
      return {
        type: 'OOC',
        ...oocResult,
      };
    }
    if (oocResult && oocResult.travelContext) {
      travelContext = oocResult.travelContext;
    }
  }

  if (workingState.narratorState?.paused) {
    return {
      type: 'PAUSED',
      mutatedState: false,
      systemMessage: 'Campaign is currently paused. Run `analysis: resumeRole` to continue.',
      campaignState: workingState,
    };
  }

  const pc = workingState.activeEntities?.players?.[0];
  if (!pc) {
    return {
      type: 'ERROR',
      mutatedState: false,
      systemMessage: 'No active player character found. Complete setup first.',
      campaignState: workingState,
    };
  }

  // Step 2: Pre-Flight Inventory Gate (Zero turn mutation if gear is absent)
  const gate = validatePreFlightInventory(
    userInput,
    pc,
    workingState.activeEntities?.activeNPCs || []
  );
  if (!gate.ok) {
    return {
      type: 'INVENTORY_GATE_BLOCK',
      mutatedState: false,
      missingItem: gate.missingItem,
      narrative: gate.immersiveError,
      campaignState, // Return untouched original state
    };
  }

  // Step 3: Deterministic Mechanics & Batched Party/Swarm Execution
  const manifestRows = [];
  let tacticalResult = null;
  if (tacticalAction) {
    tacticalResult = applyTacticalAction(pc, tacticalAction);
  }

  const checkParams = inferCheckParameters(userInput, pc);
  const mode = workingState.metaData?.rulesetMode || RULESET_MODES.CLASSIC_D20;
  let primaryRoll;

  if (mode === RULESET_MODES.PSYCH_REALISM) {
    primaryRoll = resolvePsychRealismCheck({
      player: pc,
      checkName: checkParams.checkName,
      skillName: checkParams.skillName,
      taskThreshold: checkParams.dc - 7,
      scenePressure: workingState.worldState?.combatState?.active ? 3 : 1,
      chronoSeed: chrono,
    });
  } else {
    primaryRoll = resolveD20Check({
      player: pc,
      checkName: checkParams.checkName,
      attribute: checkParams.attribute,
      skillName: checkParams.skillName,
      dc: checkParams.dc,
      chronoSeed: chrono,
      dramaticBreakthrough: checkParams.dramaticBreakthrough,
    });
  }
  manifestRows.push(primaryRoll);

  // Batched ally rolls for Tier I/II companions in combat
  if (workingState.worldState?.combatState?.active) {
    for (const npc of workingState.activeEntities.activeNPCs || []) {
      if (npc.currentTier <= 2) {
        const allyRoll = chrono.rollDie(20);
        manifestRows.push({
          actor: npc.id,
          check: 'SupportAction',
          nat: allyRoll,
          mod: 2,
          total: allyRoll + 2,
          crit: allyRoll === 20 ? 'CRIT_SUCCESS' : allyRoll === 1 ? 'CRIT_FAIL' : 'NONE',
          envFallout: 'NONE',
        });
      }
    }
  }

  // One demographic bias tick for active Tier IV Swarm Matrices
  if (Array.isArray(workingState.worldState?.environmentalSwarms) && workingState.worldState.environmentalSwarms.length > 0) {
    workingState.worldState.environmentalSwarms = tickEnvironmentalSwarms(
      workingState.worldState.environmentalSwarms,
      chrono
    );
  }

  // Step 4: Rule of 4 Context Gating & Offscreen Beat Roll
  const offscreenBeat =
    Boolean(travelContext) &&
    (workingState.activeEntities.activeNPCs || []).some((n) => n.permanenceUnlocked) &&
    chrono.nextFloat() < OFFSCREEN_BEAT_CHANCE;

  const outboundToon = encodeOutboundToon({
    campaignState: workingState,
    chronoSeedValue: chrono.seed,
    manifestRows,
    flags: {
      offscreenBeat,
      luckNudge: Boolean(primaryRoll.luckNudge),
      critArtRequired: Boolean(primaryRoll.critArtRequired),
      diegeticHelp: false,
      travelEncounter: Boolean(travelContext?.travelEncounter),
    },
    userVerbatim: userInput,
  });

  // Step 5: LLM Narrator Invocation + 1-shot T.O.O.N. Repair
  const systemPrompt = buildNarratorSystemPrompt(workingState);
  const rawLlmOutput = await llmAdapter.complete({
    systemPrompt,
    userPrompt: outboundToon,
    campaignState: workingState,
    primaryRoll,
  });

  const parsed = await parseWithOneShotRepair(rawLlmOutput, async (badRaw, errMsg) => {
    if (typeof llmAdapter.repair === 'function') {
      return llmAdapter.repair({ badRaw, errMsg, systemPrompt });
    }
    return llmAdapter.complete({
      systemPrompt,
      userPrompt: `REPAIR REQUIRED (${errMsg}). Re-emit valid ---TOON_META--- and ---NARRATIVE--- sections for:\n${badRaw}`,
      campaignState: workingState,
      primaryRoll,
    });
  });

  if (!parsed.ok) {
    throw new Error(`T.O.O.N. parse failed after repair: ${parsed.error}`);
  }

  // Step 6: Apply Inbound Meta Deltas & De Laval Nozzle
  const meta = parsed.meta;

  for (const hp of meta.hpDeltas) {
    const targetPc = workingState.activeEntities.players.find((p) => p.id === hp.id);
    if (targetPc) {
      targetPc.combatStats.health = Math.max(
        0,
        Math.min(targetPc.combatStats.maxHealth || 100, (targetPc.combatStats.health || 100) + hp.delta)
      );
    }
  }

  for (const inv of meta.invDeltas) {
    const targetPc = workingState.activeEntities.players.find((p) => p.id === inv.id);
    if (!targetPc) continue;
    if (inv.op === 'ADD') {
      targetPc.inventory.carriedItems.push({
        itemName: inv.name,
        slots: Number(inv.slots) || 0,
        category: inv.slots === 0 ? 'small' : inv.slots >= 2 ? 'large' : 'standard',
        equipped: false,
      });
    } else if (inv.op === 'REMOVE') {
      const idx = targetPc.inventory.carriedItems.findIndex(
        (i) => i.itemName.toLowerCase() === String(inv.name).toLowerCase()
      );
      if (idx !== -1) targetPc.inventory.carriedItems.splice(idx, 1);
    }
    const enc = computeEncumbrance(targetPc);
    targetPc.combatStats.encumbrancePenalty = enc.encumbered;
  }

  if (meta.telemetry) {
    if (meta.telemetry.blindReadXYZ) {
      pc.psychologicalState.inferred_XYZ_Coordinates = String(meta.telemetry.blindReadXYZ);
    }
    if (meta.telemetry.stressDelta) {
      pc.combatStats.stressLevel = Math.max(0, (pc.combatStats.stressLevel || 0) + Number(meta.telemetry.stressDelta));
    }
  }

  const asyncPortraitPromises = [];
  const nozzleRes = applyRelationalXpDeltas(workingState.activeEntities.activeNPCs, meta.npcXp, {
    onTriggerAsyncPortrait: (npc) => {
      if (typeof onAsyncNpcPortrait === 'function') {
        onAsyncNpcPortrait(npc);
      }
      if (mediaPipeline && typeof mediaPipeline.generateNpcPortraitAsync === 'function') {
        const p = mediaPipeline.generateNpcPortraitAsync({
          uid: workingState.ownerUid,
          campaignId: workingState.id,
          npc,
          style: workingState.globalState?.narratorStyle,
          onComplete: async (res) => {
            npc.portraitRef = res.storagePath;
          },
        });
        asyncPortraitPromises.push(p);
      }
    },
    onArchivePermanence: (npc) => {
      if (archivist && typeof archivist.archivePermanentNpc === 'function') {
        archivist.archivePermanentNpc(workingState.ownerUid, workingState.id, npc).catch(() => {});
      }
    },
  });

  workingState.activeEntities.activeNPCs = applyGenesUnlock(
    nozzleRes.updatedNPCs,
    meta.genesUnlock
  );

  // Scene Memory & Rule-of-4 Eviction to HISTORICAL_MEMORY
  const curScene = workingState.sceneMemory.currentScene;
  if (meta.sceneLog?.sum) {
    if (curScene.summary) {
      workingState.sceneMemory.previousScenes.push({
        id: `s_${String(workingState.metaData.turnNumber).padStart(2, '0')}`,
        locationId: curScene.locationId,
        timeAndDate: curScene.timeAndDate,
        mood: curScene.mood,
        summary: curScene.summary,
        significantDialogue: [...(curScene.significantDialogue || [])],
        characterStateChanges: [...(curScene.characterStateChanges || [])],
      });
      while (workingState.sceneMemory.previousScenes.length > RULE_OF_4_PREVIOUS_LIMIT) {
        const evicted = workingState.sceneMemory.previousScenes.shift();
        if (archivist && typeof archivist.archiveScene === 'function') {
          await archivist.archiveScene(workingState.ownerUid, workingState.id, evicted);
        }
      }
    }
    curScene.summary = meta.sceneLog.sum;
  }

  if (meta.sceneLog?.quote) {
    const colonIdx = meta.sceneLog.quote.indexOf(':');
    const speaker = colonIdx !== -1 ? meta.sceneLog.quote.slice(0, colonIdx).trim() : 'NPC';
    const quote = colonIdx !== -1 ? meta.sceneLog.quote.slice(colonIdx + 1).trim() : meta.sceneLog.quote;
    curScene.significantDialogue.push({ speaker, quote });
  }

  // Advance turn metadata & refresh AP
  workingState.metaData.turnNumber = (workingState.metaData.turnNumber || 0) + 1;
  workingState.metaData.timestamp = new Date(timestamp).toISOString();
  pc.combatStats.actionPoints = 2;

  // Step 7: Critical Graphic-Novel Panel
  let panel = null;
  if (primaryRoll.critArtRequired && mediaPipeline && typeof mediaPipeline.generateScenePanel === 'function') {
    const brief = meta.critVisualBrief || meta.sceneLog?.sum || userInput;
    panel = await mediaPipeline.generateScenePanel({
      uid: workingState.ownerUid,
      campaignId: workingState.id,
      brief,
      campaignState: workingState,
    });
  }

  // Append clean chat entries (zero TOON metadata)
  workingState.chatLog = workingState.chatLog || [];
  workingState.chatLog.push({
    id: `u_${workingState.metaData.turnNumber}`,
    role: 'player',
    text: userInput,
    timestamp: workingState.metaData.timestamp,
  });
  workingState.chatLog.push({
    id: `n_${workingState.metaData.turnNumber}`,
    role: 'narrator',
    text: parsed.narrative,
    roll: primaryRoll,
    panel,
    nozzleEvents: nozzleRes.events,
    timestamp: workingState.metaData.timestamp,
  });

  // Step 8: Persist Immutable Turn Snapshot
  if (snapshotStore && typeof snapshotStore.saveSnapshot === 'function') {
    await snapshotStore.saveSnapshot(workingState.metaData.turnNumber, workingState);
  }

  return {
    type: 'TURN_COMPLETE',
    mutatedState: true,
    turnNumber: workingState.metaData.turnNumber,
    narrative: parsed.narrative,
    roll: primaryRoll,
    tacticalResult,
    nozzleEvents: nozzleRes.events,
    panel,
    repairedToon: parsed.repaired,
    outboundToon,
    asyncPortraitCount: asyncPortraitPromises.length,
    campaignState: workingState,
  };
}

module.exports = { processTurn, inferCheckParameters };
