'use strict';

const RULESET_MODES = Object.freeze({
  CLASSIC_D20: 'CLASSIC_D20',
  PSYCH_REALISM: 'PSYCH_REALISM',
});

const SETTING_CATEGORIES = Object.freeze(['Fantasy', 'SciFi', 'ModernNoir']);

const SETTING_KEYWORDS = Object.freeze({
  Fantasy: ['fantasy', 'magic', 'dragon', 'sword', 'elf', 'dwarf', 'kingdom', 'medieval', 'arcane', 'dungeon', 'castle', 'spell', 'wizard', 'knight'],
  SciFi: ['scifi', 'sci-fi', 'cyberpunk', 'space', 'starship', 'android', 'laser', 'cyber', 'neon', 'orbital', 'galaxy', 'alien', 'mech', 'ai', 'dystopia', 'future', '2050'],
  ModernNoir: ['noir', 'detective', 'mob', 'mafia', 'jazz', 'revolver', 'city', 'alley', 'crime', 'mystery', 'modern', '1940', '1950', 'rain', 'precinct', 'syndicate'],
});

const CORE_ATTRIBUTE_NAMES = Object.freeze([
  'strength',
  'agility',
  'intellect',
  'charisma',
  'perception',
  'constitution',
  'luck',
]);

const MAX_ATTRIBUTE_TOTAL = 40;
const MIN_ATTRIBUTE_VALUE = 1;
const MAX_ATTRIBUTE_VALUE = 10;

const PROFICIENCY_BONUSES = Object.freeze({
  Untrained: 0,
  Basic: 1,
  Proficient: 2,
  Expert: 4,
  Master: 6,
});

const SKILL_RANK_NUM = Object.freeze({
  Untrained: 0,
  Basic: 1,
  Proficient: 2,
  Expert: 3,
  Master: 4,
});

const INVENTORY_SLOT_WEIGHTS = Object.freeze({
  worn: 0,
  small: 0,
  standard: 1,
  large: 2,
});

const DE_LAVAL_THRESHOLDS = Object.freeze({
  TIER_2_RELATIONAL: 25,
  TIER_1_AGENCY: 75,
  PERMANENCE: 100,
});

const RULE_OF_4_PREVIOUS_LIMIT = 3;
const OFFSCREEN_BEAT_CHANCE = 0.25;
const TRAVEL_ENCOUNTER_THRESHOLD = 75;
const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

const SETUP_STEPS = Object.freeze([
  'ignition',
  'setting',
  'parameters',
  'character_creation',
  'portrait_approval',
  'world_ignition',
]);

const ARCHIVIST_SILOS = Object.freeze({
  HISTORICAL_MEMORY: 'archivist_historical_memory',
  NPC_GENETICS_ARCHIVE: 'archivist_npc_genetics',
  WORLD_LORE_CODEX: 'archivist_world_lore',
  VISUAL_ASSET_LEDGER: 'archivist_visual_ledger',
});

function createInitialCampaignState({ campaignId, ownerUid, rulesetMode = RULESET_MODES.CLASSIC_D20, nowIso = new Date().toISOString() }) {
  return {
    id: campaignId,
    ownerUid,
    metaData: {
      project: 'Integrated_De_Laval_Engine',
      version: '7.2_Synchronized_Schema',
      timestamp: nowIso,
      sessionNumber: 1,
      turnNumber: 0,
      rulesetMode,
      ragSerializationPending: false,
      sessionSummary: [],
    },
    globalState: {
      settingDescription: '',
      settingCategories: [],
      techLevel: '',
      narratorStyle: '',
      axxRating: 2,
      scaryRating: 2,
      dateTime: '',
      playerCount: 1,
      chronoSeedActive: true,
    },
    narratorState: {
      currentProcess: 'setup',
      currentStep: 'ignition',
      activeProtocols: ['The_De_Laval_Mandate', 'Rule_Of_4_Context_Gating'],
      paused: false,
      telemetry_9_axis: {
        X_Valence: 0,
        Y_Arousal: 0,
        Z_Authority: 0,
        F_Temporal_Synthesis: 0,
        G_Locus_of_Control: 5,
        H_Perspective_Mirror: 0,
        J_Justice_vs_Grace: 0,
        K_Resonance: 0,
        L_Cathartic_Saturation: 0,
      },
    },
    sceneMemory: {
      currentScene: {
        locationId: 'loc_origin',
        timeAndDate: '',
        mood: 'Expectant',
        summary: '',
        significantDialogue: [],
        characterStateChanges: [],
      },
      previousScenes: [],
    },
    worldState: {
      activeMainQuests: {},
      activeSubplots: {},
      factions: {},
      locations: [],
      environmentalSwarms: [],
      combatState: {
        active: false,
        round: 0,
        initiativeOrder: [],
        grid: {
          width: 10,
          height: 10,
          coverCells: [
            { x: 3, y: 4, type: 'half' },
            { x: 4, y: 4, type: 'full' },
            { x: 6, y: 5, type: 'half' },
            { x: 7, y: 2, type: 'full' },
          ],
          tokens: [],
        },
      },
    },
    activeEntities: {
      players: [],
      activeNPCs: [],
    },
    chatLog: [],
  };
}

module.exports = {
  RULESET_MODES,
  SETTING_CATEGORIES,
  SETTING_KEYWORDS,
  CORE_ATTRIBUTE_NAMES,
  MAX_ATTRIBUTE_TOTAL,
  MIN_ATTRIBUTE_VALUE,
  MAX_ATTRIBUTE_VALUE,
  PROFICIENCY_BONUSES,
  SKILL_RANK_NUM,
  INVENTORY_SLOT_WEIGHTS,
  DE_LAVAL_THRESHOLDS,
  RULE_OF_4_PREVIOUS_LIMIT,
  OFFSCREEN_BEAT_CHANCE,
  TRAVEL_ENCOUNTER_THRESHOLD,
  SIGNED_URL_TTL_MS,
  SETUP_STEPS,
  ARCHIVIST_SILOS,
  createInitialCampaignState,
};
