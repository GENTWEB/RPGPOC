'use strict';

const { PROFICIENCY_BONUSES } = require('../config/constants');
const { computeEncumbrance } = require('./inventoryGate');

function getAttributeModifier(score) {
  const val = Number(score) || 1;
  if (val <= 1) return -2;
  if (val <= 3) return -1;
  if (val <= 5) return 0;
  if (val <= 7) return 1;
  if (val <= 9) return 2;
  return 3;
}

function getProficiencyBonus(rank) {
  return PROFICIENCY_BONUSES[rank] ?? 0;
}

function computeInitialLuckCharges(player) {
  const luckMod = getAttributeModifier(player?.coreAttributes?.luck ?? 5);
  return Math.max(0, luckMod);
}

function computeArmorClass(player, coverType = 'none') {
  const baseAC = Number(player?.combatStats?.armorClass) || 10;
  const hunkered = Boolean(player?.combatStats?.hunkered);
  let coverBonus = 0;
  if (coverType === 'half') coverBonus = hunkered ? 4 : 2;
  if (coverType === 'full') coverBonus = hunkered ? 10 : 5;
  return {
    baseAC,
    coverBonus,
    effectiveAC: baseAC + coverBonus,
    aoeSaveAdvantage: hunkered,
    reactionsEnabled: !hunkered,
  };
}

function applyTacticalAction(player, actionType) {
  const stats = player.combatStats;
  if (actionType === 'hunker_down') {
    if (stats.actionPoints < 1) {
      return { ok: false, reason: 'Insufficient Action Points (requires 1 AP).' };
    }
    stats.actionPoints -= 1;
    stats.hunkered = true;
    stats.overwatch = false;
    return { ok: true, action: 'hunker_down', apRemaining: stats.actionPoints };
  }

  if (actionType === 'overwatch') {
    if (stats.actionPoints < 2) {
      return { ok: false, reason: 'Insufficient Action Points (requires 2 AP).' };
    }
    stats.actionPoints -= 2;
    stats.overwatch = true;
    stats.hunkered = false;
    return { ok: true, action: 'overwatch', apRemaining: stats.actionPoints };
  }

  if (actionType === 'dash') {
    if (stats.actionPoints < 2) {
      return { ok: false, reason: 'Insufficient Action Points (requires 2 AP).' };
    }
    stats.actionPoints -= 2;
    return { ok: true, action: 'dash', apRemaining: stats.actionPoints };
  }

  if (actionType === 'standard') {
    if (stats.actionPoints < 1) {
      return { ok: false, reason: 'Insufficient Action Points (requires 1 AP).' };
    }
    stats.actionPoints -= 1;
    return { ok: true, action: 'standard', apRemaining: stats.actionPoints };
  }

  return { ok: true, action: 'free', apRemaining: stats.actionPoints };
}

function rollInitiative(entities, chronoSeed) {
  const entries = entities.map((entity) => {
    const agi = entity.coreAttributes?.agility ?? 5;
    const mod = getAttributeModifier(agi);
    const roll = chronoSeed.rollDie(20);
    return {
      id: entity.id,
      name: entity.name || entity.id,
      roll,
      mod,
      total: roll + mod,
    };
  });
  entries.sort((a, b) => b.total - a.total || b.mod - a.mod);
  return entries;
}

function resolveD20Check({
  player,
  checkName = 'General Action',
  attribute = 'agility',
  skillName = null,
  dc = 12,
  chronoSeed,
  advantage = false,
  disadvantage = false,
  dramaticBreakthrough = false,
}) {
  const enc = computeEncumbrance(player);
  if (player.combatStats) {
    player.combatStats.encumbrancePenalty = enc.encumbered;
  }

  const effectiveDisadvantage =
    disadvantage || (enc.encumbered && (attribute === 'strength' || attribute === 'agility'));

  const attrScore = player?.coreAttributes?.[attribute] ?? 5;
  const attrMod = getAttributeModifier(attrScore);
  const skillRank = skillName && player?.skills ? player.skills[skillName] : null;
  const profBonus = getProficiencyBonus(skillRank);
  const totalMod = attrMod + profBonus;

  const rollResult = chronoSeed.rollD20({
    advantage,
    disadvantage: effectiveDisadvantage,
  });

  const nat = rollResult.value;
  let total = nat + totalMod;
  let crit = 'NONE';
  let luckNudge = false;
  let outcome = total >= dc ? 'SUCCESS' : 'FAILURE';

  if (nat === 20) {
    crit = 'CRIT_SUCCESS';
    outcome = 'SUCCESS';
  } else if (nat === 1) {
    crit = 'CRIT_FAIL';
    outcome = 'FAILURE';
  }

  // Passive Luck auto-spend on narrow misses (within 2 of DC) or to soften Nat 1 fumbles
  const luckCharges = Number(player?.combatStats?.luckCharges) || 0;
  if (luckCharges > 0) {
    if (nat === 1) {
      player.combatStats.luckCharges = luckCharges - 1;
      luckNudge = true;
      crit = 'CRIT_FAIL_SOFTENED';
    } else if (outcome === 'FAILURE' && dc - total <= 2) {
      player.combatStats.luckCharges = luckCharges - 1;
      luckNudge = true;
      total += 2;
      if (total >= dc) outcome = 'SUCCESS';
    }
  }

  const critArtRequired =
    nat === 20 ||
    nat === 1 ||
    (dramaticBreakthrough && outcome === 'SUCCESS' && total >= dc + 5);

  return {
    actor: player.id || 'pc_1',
    check: checkName,
    attribute,
    skillName,
    nat,
    rolls: rollResult.rolls,
    rollMode: rollResult.mode,
    attrMod,
    profBonus,
    mod: totalMod,
    total,
    dc,
    outcome,
    crit,
    envFallout: 'NONE',
    luckNudge,
    encumbered: enc.encumbered,
    critArtRequired,
  };
}

module.exports = {
  getAttributeModifier,
  getProficiencyBonus,
  computeInitialLuckCharges,
  computeArmorClass,
  applyTacticalAction,
  rollInitiative,
  resolveD20Check,
};
