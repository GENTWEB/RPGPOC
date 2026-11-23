'use strict';

const { DE_LAVAL_THRESHOLDS } = require('../config/constants');

function ensureNpcStructure(npc) {
  const normalized = {
    id: npc.id,
    name: npc.name || npc.id,
    currentTier: typeof npc.currentTier === 'number' ? npc.currentTier : 3,
    relationalXP: Number(npc.relationalXP) || 0,
    permanenceUnlocked: Boolean(npc.permanenceUnlocked),
    portraitRef: npc.portraitRef || null,
    age: npc.age ?? null,
    axxCap: npc.age && npc.age < 19 ? 1 : null,
    genetics: npc.genetics || {
      tier_4_ambient: { demographic: '', occupation: '', sentimentBias: 'Neutral' },
      tier_3_transactional: {
        oceanTraits: { openness: 5, conscientiousness: 5, extraversion: 5, agreeableness: 5, neuroticism: 5 },
        dialogueStyle: 'Measured',
        inventory: [],
      },
      tier_2_relational: { STATUS: 'DORMANT', backstory: null, coreBeliefs: null, currentGoal: null },
      tier_1_agency: { STATUS: 'DORMANT', '9_axis_matrix': null, autonomousActions: null },
    },
  };
  return normalized;
}

function defaultNineAxisMatrix() {
  return {
    X_Valence: 0,
    Y_Arousal_Energy: 0,
    Z_Refraction_Authority: 0,
    F_Temporal_Synthesis: 0,
    G_Locus_of_Control: 5,
    H_Perspective_Mirror: 0,
    J_Justice_vs_Grace: 0,
    K_Resonance: 0,
    L_Cathartic_Saturation: 0,
  };
}

/**
 * Processes @NPC_XP deltas and advances NPCs through the De Laval Nozzle:
 *   Tier IV (Swarm) -> Tier III (Transactional) -> Tier II (>=25 XP, async portrait)
 *   -> Tier I (>=75 XP, 9-Axis Prism Engine) -> Permanence (>=100 XP, archival, never degrades).
 */
function applyRelationalXpDeltas(activeNPCs = [], xpDeltas = [], hooks = {}) {
  const events = [];
  const npcMap = new Map(activeNPCs.map((n) => [n.id, ensureNpcStructure(n)]));

  for (const deltaEntry of xpDeltas) {
    const npcId = deltaEntry.id;
    const delta = Number(deltaEntry.delta) || 0;
    const reason = deltaEntry.reason || 'Interaction';

    if (!npcMap.has(npcId)) {
      npcMap.set(npcId, ensureNpcStructure({ id: npcId, name: npcId, currentTier: 3, relationalXP: 0 }));
    }

    const npc = npcMap.get(npcId);
    const prevTier = npc.currentTier;
    const prevPerm = npc.permanenceUnlocked;

    // Permanence guarantees NPC never degrades tier or drops below 100 XP
    npc.relationalXP = Math.max(npc.permanenceUnlocked ? DE_LAVAL_THRESHOLDS.PERMANENCE : 0, npc.relationalXP + delta);

    // Tier II unlock (>= 25 XP)
    if (npc.relationalXP >= DE_LAVAL_THRESHOLDS.TIER_2_RELATIONAL && npc.currentTier > 2) {
      npc.currentTier = 2;
      if (npc.genetics.tier_2_relational.STATUS === 'DORMANT') {
        npc.genetics.tier_2_relational.STATUS = 'ACTIVE';
      }
      events.push({ type: 'TIER_2_UNLOCKED', npcId: npc.id, xp: npc.relationalXP, reason });

      if (!npc.portraitRef && typeof hooks.onTriggerAsyncPortrait === 'function') {
        hooks.onTriggerAsyncPortrait(npc);
      }
    }

    // Tier I unlock (>= 75 XP)
    if (npc.relationalXP >= DE_LAVAL_THRESHOLDS.TIER_1_AGENCY && npc.currentTier > 1) {
      npc.currentTier = 1;
      if (npc.genetics.tier_1_agency.STATUS === 'DORMANT') {
        npc.genetics.tier_1_agency.STATUS = 'ACTIVE';
        npc.genetics.tier_1_agency['9_axis_matrix'] =
          npc.genetics.tier_1_agency['9_axis_matrix'] || defaultNineAxisMatrix();
        npc.genetics.tier_1_agency.autonomousActions =
          npc.genetics.tier_1_agency.autonomousActions || [];
      }
      events.push({ type: 'TIER_1_UNLOCKED', npcId: npc.id, xp: npc.relationalXP, reason });
    }

    // Permanence Threshold (>= 100 XP)
    if (npc.relationalXP >= DE_LAVAL_THRESHOLDS.PERMANENCE && !prevPerm) {
      npc.permanenceUnlocked = true;
      npc.currentTier = 1;
      events.push({ type: 'PERMANENCE_ARCHIVED', npcId: npc.id, xp: npc.relationalXP, reason });

      if (typeof hooks.onArchivePermanence === 'function') {
        hooks.onArchivePermanence(npc);
      }
    }

    if (prevTier === npc.currentTier && delta !== 0) {
      events.push({ type: 'XP_GAINED', npcId: npc.id, delta, xp: npc.relationalXP, reason });
    }
  }

  return {
    updatedNPCs: Array.from(npcMap.values()),
    events,
  };
}

function applyGenesUnlock(activeNPCs = [], genesUnlocks = []) {
  const npcMap = new Map(activeNPCs.map((n) => [n.id, ensureNpcStructure(n)]));
  for (const unlock of genesUnlocks) {
    const npc = npcMap.get(unlock.id);
    if (!npc) continue;
    let payload = unlock.json;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (_) {
        payload = {};
      }
    }
    if (Number(unlock.tier) === 2) {
      npc.genetics.tier_2_relational = {
        ...npc.genetics.tier_2_relational,
        STATUS: 'ACTIVE',
        backstory: payload.backstory ?? npc.genetics.tier_2_relational.backstory,
        coreBeliefs: payload.coreBeliefs ?? npc.genetics.tier_2_relational.coreBeliefs,
        currentGoal: payload.currentGoal ?? npc.genetics.tier_2_relational.currentGoal,
      };
    } else if (Number(unlock.tier) === 1) {
      const matrix = {
        ...defaultNineAxisMatrix(),
        ...(payload['9_axis_matrix'] || {}),
        G_Locus_of_Control: 5,
      };
      npc.genetics.tier_1_agency = {
        ...npc.genetics.tier_1_agency,
        STATUS: 'ACTIVE',
        '9_axis_matrix': matrix,
        autonomousActions: payload.autonomousActions || npc.genetics.tier_1_agency.autonomousActions || [],
      };
    }
  }
  return Array.from(npcMap.values());
}

/**
 * Computes Euclidean distance between inferred player XYZ (Pr) and NPC XYZ (Pv)
 * for the Kinetic Governor.
 */
function computeKineticDistance(playerXYZ, npcXYZ) {
  const parse = (v) => {
    if (Array.isArray(v)) return v.map(Number);
    return String(v || '0,0,0').split(',').map((n) => Number(n.trim()) || 0);
  };
  const [px, py, pz] = parse(playerXYZ);
  const [nx, ny, nz] = parse(npcXYZ);
  return Math.sqrt((px - nx) ** 2 + (py - ny) ** 2 + (pz - nz) ** 2);
}

/**
 * Runs one demographic bias tick for active Tier IV Swarm Matrices.
 */
function tickEnvironmentalSwarms(swarms = [], chronoSeed) {
  return swarms.map((swarm) => {
    const roll = chronoSeed.rollD100();
    const pos = Number(swarm.positiveBias) || 20;
    const neg = Number(swarm.negativeBias) || 20;
    let ambientMood = 'Neutral';
    if (roll <= pos) ambientMood = 'Supportive';
    else if (roll <= pos + neg) ambientMood = 'Hostile';
    return {
      ...swarm,
      lastTickRoll: roll,
      ambientMood,
    };
  });
}

module.exports = {
  ensureNpcStructure,
  defaultNineAxisMatrix,
  applyRelationalXpDeltas,
  applyGenesUnlock,
  computeKineticDistance,
  tickEnvironmentalSwarms,
};
