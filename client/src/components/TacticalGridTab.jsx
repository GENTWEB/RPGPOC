import React, { useMemo, useState } from 'react';
import { Shield, Eye, Crosshair, RotateCcw, Sparkles } from 'lucide-react';
import { useGame } from '../context/GameContext';

const COVER_SHAPES = [
  { id: 'pillar', name: 'Pillar', cover: 'full', ac: '+5 AC', render: () => <rect x="7" y="7" width="18" height="18" rx="9" fill="currentColor" opacity="0.85" /> },
  { id: 'l_wall', name: 'L-Wall', cover: 'full', ac: '+5 AC', render: () => <path d="M4 4 H28 V12 H12 V28 H4 Z" fill="currentColor" opacity="0.85" /> },
  { id: 'crates', name: 'Crate Stack', cover: 'half', ac: '+2 AC', render: () => <g fill="currentColor" opacity="0.8"><rect x="4" y="14" width="11" height="11" rx="1.5" /><rect x="17" y="14" width="11" height="11" rx="1.5" /><rect x="10" y="4" width="11" height="9" rx="1.5" /></g> },
  { id: 'rubble', name: 'Rubble Mound', cover: 'half', ac: '+2 AC', render: () => <path d="M3 25 L9 12 L16 16 L22 9 L29 25 Z" fill="currentColor" opacity="0.75" /> },
  { id: 'barricade', name: 'Barricade', cover: 'half', ac: '+2 AC', render: () => <path d="M4 22 L8 10 H24 L28 22 Z" fill="currentColor" opacity="0.8" /> },
  { id: 'vehicle', name: 'Overturned Hull', cover: 'full', ac: '+5 AC', render: () => <g fill="currentColor" opacity="0.85"><rect x="3" y="9" width="26" height="14" rx="4" /><circle cx="9" cy="24" r="2.5" /><circle cx="23" cy="24" r="2.5" /></g> },
  { id: 'low_wall', name: 'Low Wall', cover: 'half', ac: '+2 AC', render: () => <rect x="3" y="12" width="26" height="8" rx="1.5" fill="currentColor" opacity="0.8" /> },
  { id: 'boulder', name: 'Heavy Slab', cover: 'full', ac: '+5 AC', render: () => <polygon points="6,24 4,14 11,6 23,7 28,16 24,25" fill="currentColor" opacity="0.82" /> },
  { id: 'console', name: 'Heavy Desk', cover: 'half', ac: '+2 AC', render: () => <g fill="currentColor" opacity="0.8"><rect x="4" y="8" width="24" height="10" rx="1.5" /><rect x="6" y="19" width="4" height="6" /><rect x="22" y="19" width="4" height="6" /></g> },
  { id: 'archway', name: 'Partition', cover: 'full', ac: '+5 AC', render: () => <g fill="currentColor" opacity="0.85"><rect x="4" y="4" width="7" height="24" rx="1" /><rect x="21" y="4" width="7" height="24" rx="1" /><rect x="11" y="4" width="10" height="5" /></g> },
];

function pickShapeForCell(x, y, coverType, explicitShape) {
  if (explicitShape) {
    const exact = COVER_SHAPES.find((s) => s.id === explicitShape);
    if (exact) return exact;
  }
  const pool = coverType === 'full'
    ? COVER_SHAPES.filter((s) => s.cover === 'full')
    : COVER_SHAPES.filter((s) => s.cover === 'half');
  return pool[(x * 7 + y * 13) % pool.length];
}

function generateDemoTerrain(width, height) {
  const spots = [
    { x: 2, y: 2, shape: 'l_wall', type: 'full' },
    { x: 5, y: 2, shape: 'crates', type: 'half' },
    { x: 7, y: 3, shape: 'pillar', type: 'full' },
    { x: 1, y: 5, shape: 'barricade', type: 'half' },
    { x: 4, y: 4, shape: 'vehicle', type: 'full' },
    { x: 6, y: 5, shape: 'rubble', type: 'half' },
    { x: 3, y: 6, shape: 'low_wall', type: 'half' },
    { x: 7, y: 6, shape: 'boulder', type: 'full' },
    { x: 5, y: 7, shape: 'console', type: 'half' },
    { x: 2, y: 7, shape: 'archway', type: 'full' },
  ].filter((c) => c.x < width && c.y < height);
  return spots;
}

export default function TacticalGridTab() {
  const { campaignState } = useGame();
  const combat = campaignState?.worldState?.combatState;
  const rawGrid = combat?.grid || { width: 9, height: 9, coverCells: [], tokens: [] };
  const width = Math.min(10, Math.max(6, Number(rawGrid.width) || 9));
  const height = Math.min(10, Math.max(6, Number(rawGrid.height) || 9));
  const pc = campaignState?.activeEntities?.players?.[0];
  const activeNpcs = campaignState?.activeEntities?.activeNPCs || [];

  const [demoMode, setDemoMode] = useState(false);
  const [localTokenPositions, setLocalTokenPositions] = useState({});
  const [selectedTokenId, setSelectedTokenId] = useState(null);
  const [inspectedCell, setInspectedCell] = useState(null);

  const coverCells = useMemo(() => {
    if ((rawGrid.coverCells || []).length > 0 && !demoMode) return rawGrid.coverCells;
    return generateDemoTerrain(width, height);
  }, [rawGrid.coverCells, demoMode, width, height]);

  const baseTokens = useMemo(() => {
    if ((rawGrid.tokens || []).length > 0 && !demoMode) return rawGrid.tokens;
    const list = [
      {
        id: pc?.id || 'pc_hero',
        name: pc?.name || 'You',
        label: (pc?.name || 'YOU').slice(0, 2).toUpperCase(),
        kind: 'pc',
        x: 1,
        y: height - 2,
      },
    ];
    if (demoMode || activeNpcs.length === 0) {
      list.push(
        { id: 'enemy_1', name: 'Hostile Contact A', label: 'E1', kind: 'enemy', x: width - 2, y: 1 },
        { id: 'enemy_2', name: 'Hostile Contact B', label: 'E2', kind: 'enemy', x: width - 3, y: 3 }
      );
    } else {
      activeNpcs.slice(0, 4).forEach((npc, idx) => {
        const hostile = /hostile|enemy|predator|hunter/i.test(String(npc.disposition || npc.role || ''));
        list.push({
          id: npc.id || `npc_${idx}`,
          name: npc.name || `NPC ${idx + 1}`,
          label: (npc.name || `N${idx + 1}`).slice(0, 2).toUpperCase(),
          kind: hostile ? 'enemy' : 'ally',
          x: Math.min(width - 1, 2 + idx * 2),
          y: 1 + (idx % 2),
        });
      });
    }
    return list;
  }, [rawGrid.tokens, demoMode, pc, activeNpcs, width, height]);

  const coverMap = new Map();
  for (const c of coverCells) {
    const shape = pickShapeForCell(c.x, c.y, c.type || 'half', c.shape);
    coverMap.set(`${c.x},${c.y}`, { ...c, shape });
  }

  const tokenMap = new Map();
  for (const t of baseTokens) {
    const pos = localTokenPositions[t.id] || { x: t.x, y: t.y };
    tokenMap.set(`${pos.x},${pos.y}`, { ...t, x: pos.x, y: pos.y });
  }

  const handleCellClick = (x, y, cover, token) => {
    setInspectedCell({ x, y, cover, token });
    if (token) {
      setSelectedTokenId((prev) => (prev === token.id ? null : token.id));
      return;
    }
    if (selectedTokenId && !cover) {
      setLocalTokenPositions((prev) => ({ ...prev, [selectedTokenId]: { x, y } }));
      setSelectedTokenId(null);
    }
  };

  const cells = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const key = `${x},${y}`;
      cells.push({ x, y, key, cover: coverMap.get(key), token: tokenMap.get(key) });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 text-xs font-mono">
        <span className="inline-flex items-center gap-1.5 text-amber-400 truncate">
          <Crosshair className="w-4 h-4 shrink-0" />
          {combat?.active ? `COMBAT ROUND ${combat.round}` : 'TACTICAL GRID'}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => { setDemoMode((v) => !v); setLocalTokenPositions({}); setSelectedTokenId(null); }}
            className={`px-2 py-0.5 rounded border text-[10px] inline-flex items-center gap-1 ${
              demoMode ? 'bg-amber-500/20 border-amber-500 text-amber-300' : 'bg-[#0f1419] border-slate-700 text-slate-300 hover:border-amber-500'
            }`}
            title="Preview sample combat layout with all 10 cover shapes"
          >
            <Sparkles className="w-3 h-3" /> {demoMode ? 'Live' : 'Demo'}
          </button>
          {Object.keys(localTokenPositions).length > 0 && (
            <button
              onClick={() => { setLocalTokenPositions({}); setSelectedTokenId(null); }}
              className="p-1 rounded bg-[#0f1419] border border-slate-700 text-slate-400 hover:text-white"
              title="Reset moved tokens"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {(pc?.combatStats?.hunkered || pc?.combatStats?.overwatch) && (
        <div className="flex gap-1.5 font-mono">
          {pc?.combatStats?.hunkered && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 text-[10px]">
              <Shield className="w-3 h-3" /> HUNKER
            </span>
          )}
          {pc?.combatStats?.overwatch && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px]">
              <Eye className="w-3 h-3" /> OVERWATCH
            </span>
          )}
        </div>
      )}

      {/* Interactive CSS Tactical Grid */}
      <div
        className="grid gap-1 p-2 rounded-xl bg-[#0a0f14] border border-slate-800 select-none"
        style={{ gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))` }}
      >
        {cells.map((cell) => {
          const isFull = cell.cover?.shape?.cover === 'full';
          const isHalf = cell.cover?.shape?.cover === 'half';
          const isSelected = cell.token && cell.token.id === selectedTokenId;
          const canMoveHere = Boolean(selectedTokenId && !cell.token && !cell.cover);

          return (
            <button
              type="button"
              key={cell.key}
              onClick={() => handleCellClick(cell.x, cell.y, cell.cover, cell.token)}
              title={
                cell.token
                  ? `${cell.token.name} (${cell.x},${cell.y}) - Click to select/move`
                  : cell.cover
                  ? `${cell.cover.shape.name} (${cell.cover.shape.ac}) at (${cell.x},${cell.y})`
                  : `Open floor (${cell.x},${cell.y})`
              }
              className={`aspect-square rounded flex items-center justify-center relative border transition ${
                isSelected
                  ? 'bg-emerald-500/20 border-emerald-400 ring-1 ring-emerald-400'
                  : canMoveHere
                  ? 'bg-[#161d26] border-emerald-500/30 hover:bg-emerald-500/15 hover:border-emerald-400 cursor-pointer'
                  : isFull
                  ? 'bg-slate-800/90 border-amber-500/40 text-amber-300/90'
                  : isHalf
                  ? 'bg-slate-800/50 border-teal-500/35 text-teal-300/85'
                  : 'bg-[#131a22] border-slate-800/70 hover:border-slate-700'
              }`}
            >
              {cell.token ? (
                <span
                  className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center font-bold text-[9px] font-mono shadow-md ${
                    cell.token.kind === 'pc'
                      ? 'bg-emerald-400 text-[#0a0f14] ring-2 ring-emerald-300/50'
                      : cell.token.kind === 'enemy'
                      ? 'bg-rose-500 text-white ring-2 ring-rose-400/40'
                      : 'bg-sky-400 text-[#0a0f14] ring-2 ring-sky-300/40'
                  }`}
                >
                  {cell.token.label}
                </span>
              ) : cell.cover ? (
                <svg viewBox="0 0 32 32" className="w-4/5 h-4/5">
                  {cell.cover.shape.render()}
                </svg>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Selected Cell / Move Hint Strip */}
      <div className="px-2.5 py-2 rounded-lg bg-[#0f1419] border border-slate-800 text-[11px] font-mono text-slate-300">
        {selectedTokenId ? (
          <span className="text-emerald-300">Token selected - tap any open tile to move it.</span>
        ) : inspectedCell ? (
          <span>
            ({inspectedCell.x},{inspectedCell.y}){' '}
            {inspectedCell.token
              ? `• ${inspectedCell.token.name} (${inspectedCell.token.kind.toUpperCase()})`
              : inspectedCell.cover
              ? `• ${inspectedCell.cover.shape.name} (${inspectedCell.cover.shape.cover.toUpperCase()} COVER, ${inspectedCell.cover.shape.ac})`
              : '• Open Ground'}
          </span>
        ) : (
          <span className="text-slate-500">Tap a token to reposition, or tap cover to inspect.</span>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[10px] font-mono text-slate-400">
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Player
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Enemy
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-sky-400" /> Ally
        </span>
        <span className="text-teal-300">■ Half (+2 AC)</span>
        <span className="text-amber-300">■ Full (+5 AC)</span>
      </div>
    </div>
  );
}
