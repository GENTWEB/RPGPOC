'use strict';

const fs = require('fs');
const path = require('path');
const {
  CORE_ATTRIBUTE_NAMES,
  MAX_ATTRIBUTE_TOTAL,
  MIN_ATTRIBUTE_VALUE,
  MAX_ATTRIBUTE_VALUE,
  RULESET_MODES,
  SETTING_KEYWORDS,
  SETUP_STEPS,
} = require('../config/constants');
const { normalizeInventoryList, computeEncumbrance } = require('./inventoryGate');
const { computeInitialLuckCharges } = require('./combatResolver');
const { ChronoSeed } = require('./chronoSeed');

let cachedArchetypes = null;

function loadArchetypes() {
  if (cachedArchetypes) return cachedArchetypes;
  const seedPath = path.join(__dirname, '..', 'seeds', 'archetypes.json');
  const raw = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const hydrated = {};
  for (const [category, list] of Object.entries(raw)) {
    hydrated[category] = list.map((arch) => ({
      ...arch,
      inventoryStructured: normalizeInventoryList(arch.startingInventory || []),
    }));
  }
  cachedArchetypes = hydrated;
  return hydrated;
}

function classifySettingCategories(settingText = '') {
  const lower = String(settingText).toLowerCase();
  const matched = [];
  for (const [cat, keywords] of Object.entries(SETTING_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      matched.push(cat);
    }
  }
  return matched.length > 0 ? matched : ['Custom'];
}

function validateCoreAttributes(attrs = {}) {
  let sum = 0;
  const normalized = {};
  for (const key of CORE_ATTRIBUTE_NAMES) {
    const val = Number(attrs[key] ?? 5);
    if (!Number.isFinite(val) || val < MIN_ATTRIBUTE_VALUE || val > MAX_ATTRIBUTE_VALUE) {
      return {
        ok: false,
        error: `Attribute "${key}" must be between ${MIN_ATTRIBUTE_VALUE} and ${MAX_ATTRIBUTE_VALUE}.`,
      };
    }
    normalized[key] = Math.floor(val);
    sum += normalized[key];
  }
  if (sum > MAX_ATTRIBUTE_TOTAL) {
    return {
      ok: false,
      error: `Total core attributes (${sum}) exceed the 40-point maximum cap.`,
    };
  }
  return { ok: true, sum, attributes: normalized };
}

function generateSjtScenarios() {
  const foundation = [
    'A locked door bars an urgent exit while alarms rise behind you.',
    'An ally offers stolen rations to a starving stranger.',
    'A superior gives an order that contradicts your personal code.',
    'You spot a hairline tripwire across a dimly lit corridor.',
    'A merchant tries to shortchange you in front of a crowd.',
    'A storm forces your group to abandon heavy supplies.',
    'An informant demands payment before revealing a crucial name.',
    'You catch someone rifling through your pack at night.',
    'A rival challenges your credibility in a public square.',
    'You find an unguarded ledger containing dangerous secrets.',
  ];
  const adaptiveDeepDive = [
    'Under crossfire, you can shield a civilian or secure the objective.',
    'Your closest contact admits they sold your route to survive.',
    'An experimental device could solve the crisis at personal risk.',
    'A wounded adversary begs for mercy after ambushing your squad.',
    'You must bluff past an elite checkpoint with forged credentials.',
    'A sudden blackout splits the party in hostile territory.',
    'You uncover evidence implicating a beloved community leader.',
    'A high-stakes wager offers fast passage but risks your weapon.',
    'Exhaustion sets in during a 36-hour stakeout.',
    'A faction leader offers sanctuary in exchange for permanent loyalty.',
    'You notice subtle micro-expressions betraying a negotiator\'s lie.',
    'A critical tool breaks seconds before a deadline.',
    'An unexpected ally asks you to look the other way on a crime.',
    'You must calm a panicking crowd before security opens fire.',
    'Victory requires sacrificing your own reputation to protect another.',
  ];
  return {
    foundation: foundation.map((prompt, i) => ({ id: `sjt_f_${i + 1}`, stage: 'foundation', prompt })),
    adaptiveDeepDive: adaptiveDeepDive.map((prompt, i) => ({ id: `sjt_d_${i + 1}`, stage: 'adaptive', prompt })),
    totalCount: foundation.length + adaptiveDeepDive.length,
  };
}

function getAllowedCreationMethods(settingCategories = []) {
  const isCustomOnly =
    settingCategories.length === 1 && settingCategories[0] === 'Custom';
  const methods = ['Guided', 'Random', 'SJT', 'Upload JSON'];
  if (!isCustomOnly) {
    methods.unshift('Archetype');
  }
  return methods;
}

function buildPlayerFromPayload(payload = {}, chronoSeed = new ChronoSeed()) {
  const method = payload.creationMethod || 'Guided';
  let baseAttrs = payload.coreAttributes;
  let skills = payload.skills || {};
  let rawInventory = payload.inventory || [];
  let name = payload.name || 'Unnamed Operative';

  if (method === 'Archetype' && payload.archetypeName) {
    const all = loadArchetypes();
    let found = null;
    for (const list of Object.values(all)) {
      found = list.find((a) => a.name.toLowerCase() === payload.archetypeName.toLowerCase());
      if (found) break;
    }
    if (!found) {
      return { ok: false, error: `Unknown archetype "${payload.archetypeName}".` };
    }
    baseAttrs = found.baseAttributes;
    skills = found.startingSkills;
    rawInventory = found.startingInventory;
    name = payload.name || found.name;
  } else if (method === 'Random') {
    const rolled = {};
    let budget = MAX_ATTRIBUTE_TOTAL;
    for (let i = 0; i < CORE_ATTRIBUTE_NAMES.length; i += 1) {
      const attr = CORE_ATTRIBUTE_NAMES[i];
      const remaining = CORE_ATTRIBUTE_NAMES.length - i - 1;
      const maxForThis = Math.min(9, budget - remaining * 2);
      const minForThis = Math.max(2, budget - remaining * 9);
      const span = Math.max(1, maxForThis - minForThis + 1);
      const val = minForThis + Math.floor(chronoSeed.nextFloat() * span);
      rolled[attr] = val;
      budget -= val;
    }
    baseAttrs = rolled;
    rawInventory = ['Traveler Coat', 'Utility Knife', 'Field Pack'];
    skills = { Perception: 'Proficient', Survival: 'Basic' };
  } else if (method === 'SJT') {
    const answers = Array.isArray(payload.sjtAnswers) ? payload.sjtAnswers : [];
    const scores = { strength: 5, agility: 5, intellect: 6, charisma: 6, perception: 6, constitution: 5, luck: 5 };
    for (const ans of answers) {
      const trait = ans.leaning;
      if (trait && Object.prototype.hasOwnProperty.call(scores, trait) && scores[trait] < 9) {
        scores[trait] += 1;
      }
    }
    let total = Object.values(scores).reduce((a, b) => a + b, 0);
    while (total > MAX_ATTRIBUTE_TOTAL) {
      const highestKey = CORE_ATTRIBUTE_NAMES.reduce((best, k) => (scores[k] > scores[best] ? k : best), 'strength');
      scores[highestKey] -= 1;
      total -= 1;
    }
    baseAttrs = scores;
    rawInventory = payload.inventory || ['All-Weather Jacket', 'Multi-Tool'];
  }

  const attrCheck = validateCoreAttributes(baseAttrs || {});
  if (!attrCheck.ok) return attrCheck;

  const inv = Array.isArray(rawInventory)
    ? normalizeInventoryList(rawInventory)
    : {
        wornClothing: rawInventory.wornClothing || [],
        carriedItems: rawInventory.carriedItems || [],
      };

  const player = {
    id: payload.id || 'pc_1',
    name,
    approvedPortraitRef: null,
    physicalTraits: {
      age: payload.physicalTraits?.age ?? 'Undeclared',
      race: payload.physicalTraits?.race || 'Undeclared',
      build: payload.physicalTraits?.build || 'Undeclared',
      hair: payload.physicalTraits?.hair || 'Undeclared',
      notableFeatures: payload.physicalTraits?.notableFeatures || payload.appearance || 'Undeclared',
    },
    coreAttributes: attrCheck.attributes,
    combatStats: {
      health: 100,
      maxHealth: 100,
      armorClass: 10 + Math.max(0, Math.floor((attrCheck.attributes.agility - 4) / 2)),
      movementSpeed: 30,
      actionPoints: 2,
      hunkered: false,
      overwatch: false,
      encumbrancePenalty: false,
      luckCharges: 0,
      stressLevel: 0,
    },
    skills,
    psychologicalState: {
      oceanTraits: payload.oceanTraits || {
        openness: 5,
        conscientiousness: 5,
        extraversion: 5,
        agreeableness: 5,
        neuroticism: 5,
      },
      flaws: payload.flaws || (payload.flaw ? [payload.flaw] : []),
      fears: payload.fears || [],
      behavioralDirectives: payload.behavioralDirectives || (payload.strength ? [`Relies on: ${payload.strength}`] : []),
      inferred_XYZ_Coordinates: '0,0,0',
    },
    inventory: inv,
  };

  player.combatStats.luckCharges = computeInitialLuckCharges(player);
  const enc = computeEncumbrance(player);
  player.combatStats.encumbrancePenalty = enc.encumbered;

  return { ok: true, player };
}

/**
 * Authoritative Sequential Setup State Machine.
 * Prevents skipping prerequisites (no prompt checksum hacks).
 */
function advanceSetupStep(campaignState, targetStep, payload = {}, timestamp = new Date()) {
  const currentStep = campaignState.narratorState.currentStep;
  const currentIdx = SETUP_STEPS.indexOf(currentStep);
  const targetIdx = SETUP_STEPS.indexOf(targetStep);

  if (targetIdx === -1) {
    return { ok: false, error: `Unknown setup step "${targetStep}".` };
  }
  if (targetIdx > currentIdx) {
    return {
      ok: false,
      error: `Prerequisite violation: cannot jump to "${targetStep}" before completing "${currentStep}".`,
      expectedStep: currentStep,
    };
  }

  const chrono = new ChronoSeed(timestamp);

  switch (targetStep) {
    case 'ignition': {
      campaignState.globalState.chronoSeedActive = true;
      campaignState.metaData.chronoSeedInitial = chrono.seed;
      campaignState.narratorState.currentStep = 'setting';
      return { ok: true, nextStep: 'setting', chronoSeed: chrono.seed, campaignState };
    }

    case 'setting': {
      const desc = String(payload.settingDescription || '').trim();
      if (!desc) {
        return { ok: false, error: 'Setting description (or moodboard summary) is required.' };
      }
      const categories = classifySettingCategories(desc);
      campaignState.globalState.settingDescription = desc;
      campaignState.globalState.settingCategories = categories;
      campaignState.narratorState.currentStep = 'parameters';
      return {
        ok: true,
        nextStep: 'parameters',
        settingCategories: categories,
        allowedCreationMethods: getAllowedCreationMethods(categories),
        campaignState,
      };
    }

    case 'parameters': {
      const axx = Number(payload.axxRating ?? 2);
      const scary = Number(payload.scaryRating ?? 2);
      if (axx < 0 || axx > 4) return { ok: false, error: 'Global AXX Rating must be 0-4.' };
      if (axx === 4 && !payload.axx4Confirmed) {
        return {
          ok: false,
          error: 'Explicit mature/trauma confirmation modal (axx4Confirmed: true) is required for AXX Rating 4.',
        };
      }
      if (scary < 0 || scary > 3) return { ok: false, error: 'Global SCARY Rating must be 0-3.' };

      const mode = payload.rulesetMode === RULESET_MODES.PSYCH_REALISM
        ? RULESET_MODES.PSYCH_REALISM
        : RULESET_MODES.CLASSIC_D20;

      campaignState.globalState.techLevel = String(payload.techLevel || '').trim() || 'Contemporary';
      campaignState.globalState.narratorStyle = String(payload.narratorStyle || '').trim() || 'Cinematic Noir';
      campaignState.globalState.axxRating = axx;
      campaignState.globalState.scaryRating = scary;
      campaignState.globalState.dateTime = String(payload.dateTime || '2050-09-20 04:00');
      campaignState.globalState.playerCount = Math.max(1, Number(payload.playerCount) || 1);
      campaignState.metaData.rulesetMode = mode;
      campaignState.sceneMemory.currentScene.timeAndDate = campaignState.globalState.dateTime;
      campaignState.narratorState.currentStep = 'character_creation';
      return { ok: true, nextStep: 'character_creation', campaignState };
    }

    case 'character_creation': {
      const allowed = getAllowedCreationMethods(campaignState.globalState.settingCategories);
      if (payload.creationMethod && !allowed.includes(payload.creationMethod)) {
        return {
          ok: false,
          error: `Creation method "${payload.creationMethod}" is not available for Custom settings.`,
        };
      }
      const built = buildPlayerFromPayload(payload, chrono);
      if (!built.ok) return built;

      campaignState.activeEntities.players = [built.player];
      campaignState.narratorState.currentStep = 'portrait_approval';
      return { ok: true, nextStep: 'portrait_approval', player: built.player, campaignState };
    }

    case 'portrait_approval': {
      const pc = campaignState.activeEntities.players[0];
      if (!pc) {
        return { ok: false, error: 'Character must be created before portrait approval.' };
      }
      if (!payload.approved || !payload.portraitRef) {
        return {
          ok: false,
          error: 'Campaign ignition is locked until the head-to-toe portrait is approved.',
        };
      }
      pc.approvedPortraitRef = payload.portraitRef;
      if (payload.inferredPhysicalTraits && typeof payload.inferredPhysicalTraits === 'object') {
        pc.physicalTraits = { ...pc.physicalTraits, ...payload.inferredPhysicalTraits };
      }
      campaignState.narratorState.currentStep = 'world_ignition';
      return { ok: true, nextStep: 'world_ignition', campaignState };
    }

    case 'world_ignition': {
      const pc = campaignState.activeEntities.players[0];
      if (!pc || !pc.approvedPortraitRef) {
        return {
          ok: false,
          error: 'Cannot ignite world: approved full-body portrait reference is missing.',
        };
      }
      campaignState.narratorState.currentProcess = 'gameplayLoop';
      campaignState.narratorState.currentStep = 'await_user_input';
      return { ok: true, nextStep: 'await_user_input', ignited: true, campaignState };
    }

    default:
      return { ok: false, error: 'Unhandled setup state.' };
  }
}

module.exports = {
  loadArchetypes,
  classifySettingCategories,
  validateCoreAttributes,
  generateSjtScenarios,
  getAllowedCreationMethods,
  buildPlayerFromPayload,
  advanceSetupStep,
};
