'use strict';

const { INVENTORY_SLOT_WEIGHTS } = require('../config/constants');

const KNOWN_GEAR_KEYWORDS = [
  'grapple line', 'grappling hook', 'lockpick', 'lockpicks', 'thieves\' tools',
  'combat knife', 'knife', 'dagger', 'sword', 'longsword', 'shortsword', 'axe',
  'bow', 'longbow', 'quiver', 'arrows', 'pistol', 'cyberpunk pistol', 'laser pistol',
  'blaster pistol', 'revolver', 'derringer', 'rifle', 'pulse rifle', 'sniper rifle',
  'tommy gun', 'grenade', 'frag grenades', 'medkit', 'medical kit', 'cyberdeck',
  'crowbar', 'flashlight', 'rope', 'smoke bomb', 'poison', 'vial of deadly poison',
  'scalpel', 'wrench', 'heavy wrench', 'shield', 'mace', 'staff', 'lute', 'camera',
  'handcuffs', 'tranq pistol', 'data-jack', 'cable', 'baton', 'nightstick',
];

const USAGE_VERB_REGEX = /\b(use|using|draw|drawing|pull|pulling|fire|firing|shoot|shooting|swing|swinging|throw|throwing|toss|tossing|equip|equipping|activate|activating|deploy|deploying|disarm\s+.*\s+with|unlock\s+.*\s+with|pick\s+.*\s+with|slice\s+.*\s+with|cut\s+.*\s+with|with\s+my|with\s+a|with\s+the)\b/i;

function normalizeItemName(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function classifyInventoryString(rawName) {
  const name = String(rawName || '').trim();
  const lower = name.toLowerCase();

  if (/(armor|robe|tunic|pelt|chainmail|outfit|cloak|loincloth|uniform|suit|jacket|coat|dress|jumpsuit|gloves|tank top|tattoo|dog tags|concealment)/.test(lower)) {
    return { itemName: name, slots: INVENTORY_SLOT_WEIGHTS.worn, category: 'worn', equipped: true };
  }
  if (/(two-handed|massive|longbow|rifle|tommy gun|full plate|shield|staff|lute|briefcase|car|pick|heavy wrench|kit)/.test(lower)) {
    return { itemName: name, slots: INVENTORY_SLOT_WEIGHTS.large, category: 'large', equipped: false };
  }
  if (/(chip|codes|key|id|pass|symbol|vial|cigar|flask|microphone|cable|pin|cap|notebook|dagger|scalpel|ring|coin|badge|secrets|sense of justice)/.test(lower)) {
    return { itemName: name, slots: INVENTORY_SLOT_WEIGHTS.small, category: 'small', equipped: true };
  }
  return { itemName: name, slots: INVENTORY_SLOT_WEIGHTS.standard, category: 'standard', equipped: true };
}

function normalizeInventoryList(list = []) {
  const wornClothing = [];
  const carriedItems = [];

  for (const entry of list) {
    const obj = typeof entry === 'string'
      ? classifyInventoryString(entry)
      : {
          itemName: entry.itemName || entry.name || 'Unknown Item',
          slots: typeof entry.slots === 'number' ? entry.slots : INVENTORY_SLOT_WEIGHTS[entry.category] ?? 1,
          category: entry.category || (entry.slots === 0 ? 'small' : entry.slots >= 2 ? 'large' : 'standard'),
          equipped: Boolean(entry.equipped),
        };
    if (obj.category === 'worn') {
      wornClothing.push({ ...obj, slots: 0, equipped: true });
    } else {
      carriedItems.push(obj);
    }
  }
  return { wornClothing, carriedItems };
}

function computeEncumbrance(player) {
  const carried = (player.inventory && player.inventory.carriedItems) || [];
  const usedSlots = carried.reduce((sum, item) => sum + (Number(item.slots) || 0), 0);
  const maxSlots = Math.max(1, Number(player.coreAttributes?.strength) || 5);
  const encumbered = usedSlots > maxSlots;
  return {
    usedSlots,
    maxSlots,
    encumbered,
    effectiveMovementSpeed: encumbered
      ? Math.max(5, Math.floor((player.combatStats?.movementSpeed || 30) / 2))
      : (player.combatStats?.movementSpeed || 30),
  };
}

function collectAvailableItems(player, nearbyAllies = []) {
  const items = [];
  if (player && player.inventory) {
    for (const w of player.inventory.wornClothing || []) items.push(w.itemName);
    for (const c of player.inventory.carriedItems || []) items.push(c.itemName);
  }
  for (const ally of nearbyAllies) {
    const inv = ally?.genetics?.tier_3_transactional?.inventory || ally?.inventory || [];
    for (const entry of inv) {
      items.push(typeof entry === 'string' ? entry : entry.itemName);
    }
  }
  return items.map(normalizeItemName);
}

function extractInvokedGear(userInput) {
  const text = String(userInput || '');
  if (!USAGE_VERB_REGEX.test(text)) {
    return [];
  }

  const lower = normalizeItemName(text);
  const invoked = [];

  for (const kw of KNOWN_GEAR_KEYWORDS) {
    const normKw = normalizeItemName(kw);
    const pattern = new RegExp(`\\b${normKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(lower)) {
      invoked.push(kw);
    }
  }

  const explicitWithMatch = text.match(/\b(?:with|using|pull(?:ing)?\s+out|fire|draw(?:ing)?)\s+(?:my|the|a|an)\s+([a-z0-9\-'\s]{3,32}?)(?:[.,;!?]|(?:\s+(?:at|on|to|into|from|against|and|then|before))\b|$)/i);
  if (explicitWithMatch && explicitWithMatch[1]) {
    const phrase = explicitWithMatch[1].trim();
    const normPhrase = normalizeItemName(phrase);
    const ignoreBodyParts = /^(hand|hands|bare hands|fist|fists|foot|feet|eyes|voice|wits|charm|instinct|gut|reflexes|shoulder|elbow|knee|head)$/;
    if (!ignoreBodyParts.test(normPhrase) && !invoked.some((i) => normalizeItemName(i) === normPhrase)) {
      invoked.push(phrase);
    }
  }

  return invoked;
}

function validatePreFlightInventory(userInput, player, nearbyAllies = []) {
  const invokedItems = extractInvokedGear(userInput);
  if (invokedItems.length === 0) {
    return { ok: true, invokedItems: [], missingItem: null };
  }

  const available = collectAvailableItems(player, nearbyAllies);

  for (const item of invokedItems) {
    const normItem = normalizeItemName(item);
    const itemTokens = normItem.split(' ').filter((t) => t.length > 2);
    const found = available.some((avail) => {
      if (avail.includes(normItem) || normItem.includes(avail)) return true;
      if (itemTokens.length > 0 && itemTokens.every((t) => avail.includes(t))) return true;
      return false;
    });

    if (!found) {
      return {
        ok: false,
        invokedItems,
        missingItem: item,
        immersiveError: `You reach into your pack for a ${item} — nothing there. Your webbing comes up empty.`,
      };
    }
  }

  return { ok: true, invokedItems, missingItem: null };
}

module.exports = {
  classifyInventoryString,
  normalizeInventoryList,
  computeEncumbrance,
  extractInvokedGear,
  validatePreFlightInventory,
};
