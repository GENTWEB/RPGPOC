import React from 'react';
import { Shield, Eye, Crosshair } from 'lucide-react';
import { useGame } from '../context/GameContext';

export default function TacticalGridTab() {
  const { campaignState } = useGame();
  const combat = campaignState?.worldState?.combatState;
  const grid = combat?.grid || { width: 10, height: 10, coverCells: [], tokens: [] };
  const pc = campaignState?.activeEntities?.players?.[0];

  const coverMap = new Map();
  for (const c of grid.coverCells || []) {
    coverMap.set(`${c.x},${c.y}`, c.type);
  }

  const tokenMap = new Map();
  for (const t of grid.tokens || []) {
    tokenMap.set(`${t.x},${t.y}`, t);
  }
  if (pc && tokenMap.size === 0) {
    tokenMap.set('2,7', { id: pc.id, label: (pc.name || 'PC').slice(0, 2).toUpperCase(), kind: 'pc' });
  }

  const cells = [];
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const key = `${x},${y}`;
      const cover = coverMap.get(key);
      const token = tokenMap.get(key);
      cells.push({ x, y, key, cover, token });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs font-mono">
        <span className="inline-flex items-center gap-1.5 text-amber-400">
          <Crosshair className="w-4 h-4" />
          {combat?.active ? `COMBAT ROUND ${combat.round}` : 'TACTICAL GRID (STANDBY)'}
        </span>
        <div className="flex gap-1.5">
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
      </div>

      {/* Interactive XCOM-Style Grid */}
      <div
        className="grid gap-1 p-2 rounded-xl bg-[#0f1419] border border-slate-800"
        style={{ gridTemplateColumns: `repeat(${grid.width}, minmax(0, 1fr))` }}
      >
        {cells.map((cell) => {
          const isHalf = cell.cover === 'half';
          const isFull = cell.cover === 'full';
          return (
            <div
              key={cell.key}
              title={`(${cell.x},${cell.y})${isHalf ? ' Half Cover (+2 AC)' : isFull ? ' Full Cover (+5 AC)' : ''}`}
              className={`aspect-square rounded flex items-center justify-center text-[10px] font-mono border transition ${
                isFull
                  ? 'bg-slate-700 border-amber-500/50 text-amber-300'
                  : isHalf
                  ? 'bg-slate-800/80 border-teal-500/40 text-teal-300'
                  : 'bg-[#161d26] border-slate-800/80 text-slate-600'
              }`}
            >
              {cell.token ? (
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] ${
                    cell.token.kind === 'pc'
                      ? 'bg-amber-500 text-[#0f1419]'
                      : 'bg-teal-500 text-[#0f1419]'
                  }`}
                >
                  {cell.token.label}
                </span>
              ) : isFull ? (
                '■'
              ) : isHalf ? (
                '◧'
              ) : (
                ''
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[11px] font-mono text-slate-400">
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> PC
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-teal-500" /> NPC
        </span>
        <span className="text-teal-300">◧ Half Cover (+2 AC)</span>
        <span className="text-amber-300">■ Full Cover (+5 AC)</span>
      </div>
    </div>
  );
}
