'use strict';

function q(str) {
  return `"${String(str ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
}

function isEscaped(str, idx) {
  let backslashes = 0;
  let pos = idx - 1;
  while (pos >= 0 && str[pos] === '\\') {
    backslashes += 1;
    pos -= 1;
  }
  return backslashes % 2 === 1;
}

function parseCsvRow(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && !isEscaped(line, i)) {
      inQuotes = !inQuotes;
      cur += ch;
    } else if (ch === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result.map((cell) => {
    if (cell.startsWith('"') && cell.endsWith('"') && cell.length >= 2) {
      return cell.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    return cell;
  });
}

function encodeOutboundToon({
  campaignState,
  chronoSeedValue,
  manifestRows = [],
  flags = {},
  userVerbatim = '',
}) {
  const gs = campaignState.globalState || {};
  const meta = campaignState.metaData || {};
  const scene = campaignState.sceneMemory?.currentScene || {};
  const prevScenes = (campaignState.sceneMemory?.previousScenes || []).slice(-3);
  const pc = campaignState.activeEntities?.players?.[0];
  const npcs = campaignState.activeEntities?.activeNPCs || [];

  const lines = [];
  lines.push(
    `@CTX loc:${scene.locationId || 'loc_origin'}|time:${q(scene.timeAndDate || gs.dateTime || '')}|mode:${meta.rulesetMode || 'CLASSIC_D20'}|seed:${chronoSeedValue}|setting:${(gs.settingCategories || ['Custom']).join(',')}|axx:${gs.axxRating ?? 2}|scary:${gs.scaryRating ?? 2}`
  );

  lines.push(`@R4[${prevScenes.length}]{id,sum}:`);
  prevScenes.forEach((s, idx) => {
    lines.push(`  ${s.id || `s_0${idx + 1}`},${q(s.summary || '')}`);
  });

  if (pc) {
    const cs = pc.combatStats || {};
    lines.push(
      `@PC id:${pc.id}|hp:${cs.health ?? 100}|ac:${cs.armorClass ?? 10}|ap:${cs.actionPoints ?? 2}|enc:${Boolean(cs.encumbrancePenalty)}|stress:${cs.stressLevel ?? 0}|luck:${cs.luckCharges ?? 0}|hunkered:${Boolean(cs.hunkered)}|overwatch:${Boolean(cs.overwatch)}`
    );

    const allInv = [
      ...(pc.inventory?.carriedItems || []),
      ...(pc.inventory?.wornClothing || []),
    ];
    lines.push(`@INV[${allInv.length}]{name,slots,eq}:`);
    for (const item of allInv) {
      lines.push(`  ${q(item.itemName)},${Number(item.slots) || 0},${Boolean(item.equipped)}`);
    }
  }

  lines.push(`@NPCS[${npcs.length}]{id,tier,xp,perm,xyz}:`);
  for (const npc of npcs) {
    const m = npc.genetics?.tier_1_agency?.['9_axis_matrix'];
    const xyz = m ? `${m.X_Valence ?? 0},${m.Y_Arousal_Energy ?? 0},${m.Z_Refraction_Authority ?? 0}` : '0,0,0';
    lines.push(`  ${npc.id},${npc.currentTier},${npc.relationalXP},${Boolean(npc.permanenceUnlocked)},${q(xyz)}`);
  }

  lines.push(`@MANIFEST[${manifestRows.length}]{actor,check,nat,mod,total,crit,envFallout}:`);
  for (const r of manifestRows) {
    lines.push(`  ${r.actor},${r.check},${r.nat},${r.mod},${r.total},${r.crit || 'NONE'},${r.envFallout || 'NONE'}`);
  }

  const mergedFlags = {
    primacyLock: true,
    offscreenBeat: Boolean(flags.offscreenBeat),
    luckNudge: Boolean(flags.luckNudge),
    critArtRequired: Boolean(flags.critArtRequired),
    diegeticHelp: Boolean(flags.diegeticHelp),
    travelEncounter: Boolean(flags.travelEncounter),
  };
  lines.push(
    `@FLAGS primacyLock:${mergedFlags.primacyLock}|offscreenBeat:${mergedFlags.offscreenBeat}|luckNudge:${mergedFlags.luckNudge}|critArtRequired:${mergedFlags.critArtRequired}|diegeticHelp:${mergedFlags.diegeticHelp}` +
      (mergedFlags.travelEncounter ? '|travelEncounter:true' : '')
  );

  const recentChat = (campaignState.chatLog || [])
    .filter((m) => m && (m.role === 'player' || m.role === 'narrator') && m.text)
    .slice(-6);
  if (recentChat.length > 0) {
    lines.push(`@RECENT_EXCHANGE[${recentChat.length}]:`);
    for (const m of recentChat) {
      const clean = String(m.text).replace(/\s+/g, ' ').trim().slice(0, 900);
      lines.push(`  [${m.role === 'player' ? 'PLAYER' : 'GM'}]: ${clean}`);
    }
  }

  lines.push('@USER_VERBATIM:');
  lines.push(String(userVerbatim || ''));

  return lines.join('\n');
}

function parseKeyValPipe(str) {
  const out = {};
  const regex = /([a-zA-Z0-9_]+):("(?:\\.|[^"\\])*"|[^|]+)/g;
  let match;
  while ((match = regex.exec(str)) !== null) {
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1).replace(/\\"/g, '"');
    } else if (val === 'true') {
      val = true;
    } else if (val === 'false') {
      val = false;
    } else if (/^-?\d+(\.\d+)?$/.test(val)) {
      val = Number(val);
    }
    out[match[1]] = val;
  }
  return out;
}

function parseInboundToon(rawText) {
  const text = String(rawText || '');
  const metaMarker = '---TOON_META---';
  const narrMarker = '---NARRATIVE---';

  const metaIdx = text.indexOf(metaMarker);
  const narrIdx = text.indexOf(narrMarker);

  if (metaIdx === -1 || narrIdx === -1 || narrIdx < metaIdx) {
    return {
      ok: false,
      error: 'Missing or misordered ---TOON_META--- / ---NARRATIVE--- delimiters.',
      raw: text,
    };
  }

  const metaBlock = text.slice(metaIdx + metaMarker.length, narrIdx).trim();
  const narrativeRaw = text.slice(narrIdx + narrMarker.length).trim();

  const narrative = narrativeRaw
    .replace(/^---TOON_META---[\s\S]*?---NARRATIVE---/gm, '')
    .replace(/\s*\u2014\s*/g, ' - ')
    .replace(/^@(HP_DELTA|INV_DELTA|NPC_MEET|NPC_XP|GRID_MOVE|ACTION_COST|GENES_UNLOCK|TELEMETRY|SCENE_LOG|CRIT_VISUAL_BRIEF).*$/gm, '')
    .trim();

  if (!narrative) {
    return { ok: false, error: 'Empty ---NARRATIVE--- section.', raw: text };
  }

  const parsed = {
    hpDeltas: [],
    invDeltas: [],
    npcMeets: [],
    npcXp: [],
    gridMoves: [],
    actionCost: { action: 'none', movePenaltyPct: 0, reason: '' },
    genesUnlock: [],
    telemetry: { blindReadXYZ: '0,0,0', kineticSpike: false, stressDelta: 0 },
    sceneLog: { sum: '', quote: '' },
    critVisualBrief: '',
  };

  const lines = metaBlock.split(/\r?\n/);
  let currentSection = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('@HP_DELTA')) { currentSection = 'HP_DELTA'; continue; }
    if (trimmed.startsWith('@INV_DELTA')) { currentSection = 'INV_DELTA'; continue; }
    if (trimmed.startsWith('@NPC_MEET')) { currentSection = 'NPC_MEET'; continue; }
    if (trimmed.startsWith('@NPC_XP')) { currentSection = 'NPC_XP'; continue; }
    if (trimmed.startsWith('@GRID_MOVE')) { currentSection = 'GRID_MOVE'; continue; }
    if (trimmed.startsWith('@GENES_UNLOCK')) { currentSection = 'GENES_UNLOCK'; continue; }
    if (trimmed.startsWith('@ACTION_COST')) {
      currentSection = null;
      const kv = parseKeyValPipe(trimmed.slice('@ACTION_COST'.length).trim());
      parsed.actionCost = { ...parsed.actionCost, ...kv };
      continue;
    }
    if (trimmed.startsWith('@TELEMETRY')) {
      currentSection = null;
      const kv = parseKeyValPipe(trimmed.slice('@TELEMETRY'.length).trim());
      parsed.telemetry = { ...parsed.telemetry, ...kv };
      continue;
    }
    if (trimmed.startsWith('@SCENE_LOG')) {
      currentSection = null;
      const kv = parseKeyValPipe(trimmed.slice('@SCENE_LOG'.length).trim());
      parsed.sceneLog = { ...parsed.sceneLog, ...kv };
      continue;
    }
    if (trimmed.startsWith('@CRIT_VISUAL_BRIEF')) {
      currentSection = null;
      const briefMatch = trimmed.match(/^@CRIT_VISUAL_BRIEF\s+"((?:\\.|[^"\\])*)"/);
      parsed.critVisualBrief = briefMatch ? briefMatch[1].replace(/\\"/g, '"') : trimmed.slice('@CRIT_VISUAL_BRIEF'.length).trim();
      continue;
    }

    if (currentSection && !trimmed.startsWith('@')) {
      const cells = parseCsvRow(trimmed);
      if (currentSection === 'HP_DELTA' && cells.length >= 2) {
        parsed.hpDeltas.push({ id: cells[0], delta: Number(cells[1]) || 0 });
      } else if (currentSection === 'INV_DELTA' && cells.length >= 3) {
        parsed.invDeltas.push({
          id: cells[0],
          op: String(cells[1] || 'ADD').toUpperCase(),
          name: cells[2],
          slots: Number(cells[3] ?? 1),
        });
      } else if (currentSection === 'NPC_MEET' && cells.length >= 2) {
        parsed.npcMeets.push({
          id: cells[0],
          name: cells[1],
          role: cells[2] || 'Character',
          disposition: cells[3] || 'neutral',
        });
      } else if (currentSection === 'GRID_MOVE' && cells.length >= 3) {
        parsed.gridMoves.push({
          id: cells[0],
          x: Math.max(0, Math.min(8, Number(cells[1]) || 0)),
          y: Math.max(0, Math.min(8, Number(cells[2]) || 0)),
          kind: cells[3] || 'enemy',
        });
      } else if (currentSection === 'NPC_XP' && cells.length >= 2) {
        parsed.npcXp.push({
          id: cells[0],
          delta: Number(cells[1]) || 0,
          reason: cells[2] || 'Interaction',
        });
      } else if (currentSection === 'GENES_UNLOCK' && cells.length >= 3) {
        parsed.genesUnlock.push({
          id: cells[0],
          tier: Number(cells[1]),
          json: cells.slice(2).join(','),
        });
      }
    }
  }

  return { ok: true, meta: parsed, narrative };
}

async function parseWithOneShotRepair(rawText, repairCallback) {
  const firstAttempt = parseInboundToon(rawText);
  if (firstAttempt.ok) return { ...firstAttempt, repaired: false };
  if (typeof repairCallback !== 'function') return { ...firstAttempt, repaired: false };
  const repairedRaw = await repairCallback(rawText, firstAttempt.error);
  const secondAttempt = parseInboundToon(repairedRaw);
  return { ...secondAttempt, repaired: true };
}

module.exports = {
  encodeOutboundToon,
  parseInboundToon,
  parseWithOneShotRepair,
};
