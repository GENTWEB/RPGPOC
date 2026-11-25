'use strict';

/**
 * Classifies an LLM model ID into one of three De Laval capability tiers:
 * - LITE: Fast/small fallback models -> minimal 2-tag TOON ("graceful stall")
 * - STANDARD: Core daily-driver models (Gemma 4 26B/31B, Gemini Flash) -> full core TOON
 * - FRONTIER: Paid frontier / omni-capable models (Pro, Opus, Sonnet, Argon, Video) -> expanded simulation + video hooks
 */
function getModelCapabilityTier(modelId = '') {
  const id = String(modelId || '').toLowerCase();
  if (!id) return 'STANDARD';
  if (/flash-lite|lite|nano|mini-fast|\b4b\b|\b8b\b|haiku-3/.test(id)) return 'LITE';
  if (/\bpro\b|opus|sonnet|\bo1\b|\bo3\b|gpt-5|argon|omni|ultra/.test(id)) return 'FRONTIER';
  return 'STANDARD';
}

/**
 * Deterministic safety net for Deep Realism movement penalties when a model omits @ACTION_COST.
 */
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

module.exports = {
  getModelCapabilityTier,
  inferDeterministicActionCost,
};
