'use strict';

const { SKILL_RANK_NUM } = require('../config/constants');
const { computeEncumbrance } = require('./inventoryGate');

/**
 * PSYCH_REALISM ("Know Thyself") Resolver:
 * Internal composure is strictly deterministic — no lucky dice rescue reckless choices:
 *   composure = (skillRank * 2) + ocean.conscientiousness - ocean.neuroticism - activeStress - scenePressure
 * Chrono-Seed PRNG is rolled strictly for external environmental fallout:
 *   1-33:  SEVERE_COMPLICATION (e.g., jammed lock cylinder, power surge)
 *   34-66: ENVIRONMENTAL_SHIFT (audible noise, shifting hazard)
 *   67-100: CLEAN_BREAK (external world cooperates, allowing retry)
 */
function resolvePsychRealismCheck({
  player,
  checkName = 'Composure Action',
  skillName = null,
  taskThreshold = 5,
  scenePressure = 1,
  chronoSeed,
}) {
  const enc = computeEncumbrance(player);
  if (player.combatStats) {
    player.combatStats.encumbrancePenalty = enc.encumbered;
  }

  const skillRankLabel = skillName && player?.skills ? player.skills[skillName] : 'Untrained';
  const skillRank = SKILL_RANK_NUM[skillRankLabel] ?? 0;

  const ocean = player?.psychologicalState?.oceanTraits || {
    conscientiousness: 5,
    neuroticism: 5,
  };
  const conscientiousness = Number(ocean.conscientiousness) ?? 5;
  const neuroticism = Number(ocean.neuroticism) ?? 5;
  const activeStress = Number(player?.combatStats?.stressLevel) || 0;
  const encPenalty = enc.encumbered ? 2 : 0;

  const composure = (skillRank * 2) + conscientiousness - neuroticism - activeStress - scenePressure - encPenalty;
  const faltered = composure < taskThreshold;

  // Environmental fallout ONLY via Chrono-Seed PRNG
  const envRoll = chronoSeed.rollD100();
  let envFallout = 'CLEAN_BREAK';
  let envDetail = 'External conditions hold steady, leaving room to recover or retry.';
  if (envRoll <= 33) {
    envFallout = 'SEVERE_COMPLICATION';
    envDetail = 'Severe external complication strikes (jammed mechanism, structural shift, or sudden obstruction).';
  } else if (envRoll <= 66) {
    envFallout = 'ENVIRONMENTAL_SHIFT';
    envDetail = 'An audible noise or environmental shift draws unwanted attention.';
  }

  const activeFlaws = player?.psychologicalState?.flaws || [];
  const triggeredFlaw = faltered && activeFlaws.length > 0 ? activeFlaws[0] : null;

  const crit = !faltered && composure >= taskThreshold + 5
    ? 'COMPOSURE_BREAKTHROUGH'
    : (faltered && envFallout === 'SEVERE_COMPLICATION' ? 'CRIT_FAIL' : 'NONE');

  const critArtRequired = crit === 'COMPOSURE_BREAKTHROUGH' || crit === 'CRIT_FAIL';

  return {
    actor: player.id || 'pc_1',
    check: checkName,
    skillName,
    skillRank,
    composure,
    taskThreshold,
    scenePressure,
    activeStress,
    faltered,
    outcome: faltered ? 'FALTER' : 'COMPOSED_SUCCESS',
    triggeredFlaw,
    envRoll,
    envFallout,
    envDetail,
    nat: envRoll,
    mod: composure,
    total: composure,
    crit,
    luckNudge: false,
    encumbered: enc.encumbered,
    critArtRequired,
  };
}

module.exports = { resolvePsychRealismCheck };
