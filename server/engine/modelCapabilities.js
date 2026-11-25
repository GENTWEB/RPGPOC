'use strict';

function getModelCapabilityTier(modelId = '') {
  const id = String(modelId || '').toLowerCase();
  if (!id) return 'STANDARD';
  if (/flash-lite|lite|nano|mini-fast|\b4b\b|\b8b\b|haiku-3/.test(id)) return 'LITE';
  if (/\bpro\b|opus|sonnet|\bo1\b|\bo3\b|gpt-5|argon|omni|ultra/.test(id)) return 'FRONTIER';
  return 'STANDARD';
}

function inferDeterministicActionCost(userInput = '') {
  const text = String(userInput || '').toLowerCase();
  if (!text) return { action: 'none', movePenaltyPct: 0, reason: '' };

  if (/\b(heave|haul|drag|carry|carrying|hoist|lift|lug|pushing heavy|heavy)\b/.test(text)) {
    return { action: 'heavy_carry', movePenaltyPct: 50, reason: 'Heavy load' };
  }
  if (/\b(bandage|treat|stitch|heal|disarm|defuse|pick the lock|lockpick|hack|hotwire|repair)\b/.test(text)) {
    return { action: 'focused_task', movePenaltyPct: 40, reason: 'Focused technical action' };
  }
  if (/\b(search|rifl|rummag|inspect|examin|investigat|ransack|loot|check every|drawer|desk|cabinet)\b/.test(text)) {
    return { action: 'inspect', movePenaltyPct: 30, reason: 'Searching the area' };
  }
  return { action: 'none', movePenaltyPct: 0, reason: '' };
}

function inferDeterministicBondXp({ userInput = '', sceneSum = '', narrative = '', activeNPCs = [], existingXpIds = new Set() }) {
  const combined = `${userInput} ${sceneSum} ${narrative}`;
  const results = [];
  const isMajorBond = /\b(deal|partner|partnership|pact|alliance|handshake|truce|join me|joined|trust|save|saved|rescue|oath|swear)\b/i.test(combined);
  for (const npc of activeNPCs || []) {
    const id = String(npc.id || '').toLowerCase();
    const name = String(npc.name || '').trim();
    if (!id || !name || existingXpIds.has(id)) continue;
    const firstName = name.split(/\s+/)[0];
    if (firstName.length < 2) continue;
    const escaped = firstName.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
    const mentioned = new RegExp(`\\b${escaped}\\b`, 'i').test(`${sceneSum} ${narrative}`);
    if (mentioned) {
      results.push({
        id: npc.id,
        delta: isMajorBond ? 20 : 5,
        reason: isMajorBond ? 'Major pact / partnership' : 'Scene interaction',
      });
    }
  }
  return results;
}

module.exports = {
  getModelCapabilityTier,
  inferDeterministicActionCost,
  inferDeterministicBondXp,
};
