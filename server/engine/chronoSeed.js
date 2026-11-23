'use strict';

/**
 * Chrono-Seed PRNG:
 * Sums all decimal digits of a real-world timestamp (or deterministic test timestamp)
 * to produce a transparent seed, then drives a Mulberry32 PRNG for dice, loot,
 * weather, travel encounters, and Tier IV swarm sampling.
 */
function sumTimestampDigits(timestamp = new Date()) {
  const iso = typeof timestamp === 'string'
    ? timestamp
    : new Date(timestamp).toISOString();
  const digits = iso.replace(/\D/g, '');
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    sum += Number(digits[i]);
  }
  return sum > 0 ? sum : 1;
}

function createMulberry32(seedInt) {
  let state = (seedInt >>> 0) || 1;
  return function nextFloat() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class ChronoSeed {
  constructor(timestamp = new Date(), salt = 0) {
    this.timestamp = typeof timestamp === 'string' ? timestamp : new Date(timestamp).toISOString();
    this.digitSum = sumTimestampDigits(this.timestamp);
    this.seed = this.digitSum + (Number(salt) || 0);
    this._rng = createMulberry32(this.seed * 2654435761);
  }

  nextFloat() {
    return this._rng();
  }

  rollDie(sides = 20) {
    const s = Math.max(2, Math.floor(sides));
    return Math.floor(this.nextFloat() * s) + 1;
  }

  rollD20({ advantage = false, disadvantage = false } = {}) {
    const r1 = this.rollDie(20);
    if (advantage && !disadvantage) {
      const r2 = this.rollDie(20);
      return { value: Math.max(r1, r2), rolls: [r1, r2], mode: 'advantage' };
    }
    if (disadvantage && !advantage) {
      const r2 = this.rollDie(20);
      return { value: Math.min(r1, r2), rolls: [r1, r2], mode: 'disadvantage' };
    }
    return { value: r1, rolls: [r1], mode: 'normal' };
  }

  rollD100() {
    return this.rollDie(100);
  }

  pick(items) {
    if (!Array.isArray(items) || items.length === 0) return null;
    return items[Math.floor(this.nextFloat() * items.length)];
  }
}

module.exports = {
  ChronoSeed,
  sumTimestampDigits,
  createMulberry32,
};
