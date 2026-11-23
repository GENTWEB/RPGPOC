import React from 'react';
import { Lock, UserCheck, Sparkles } from 'lucide-react';
import { useGame } from '../context/GameContext';

const TIER_LABELS = {
  1: { label: 'TIER I // AGENCY', color: 'text-amber-300 border-amber-400/50 bg-amber-500/15' },
  2: { label: 'TIER II // ANCHOR', color: 'text-teal-300 border-teal-400/50 bg-teal-500/15' },
  3: { label: 'TIER III // TRANSACT', color: 'text-slate-300 border-slate-600 bg-slate-800/60' },
  4: { label: 'TIER IV // SWARM', color: 'text-slate-400 border-slate-700 bg-slate-900' },
};

export default function SquadTab() {
  const { campaignState } = useGame();
  const npcs = campaignState?.activeEntities?.activeNPCs || [];

  if (npcs.length === 0) {
    return (
      <div className="text-xs font-mono text-slate-500 text-center py-10">
        No companions or met NPCs in current scene.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {npcs.map((npc) => {
        const tierMeta = TIER_LABELS[npc.currentTier] || TIER_LABELS[3];
        const xp = Number(npc.relationalXP) || 0;
        const pct = Math.min(100, xp);
        const rel = npc.genetics?.tier_2_relational;

        return (
          <div
            key={npc.id}
            className="rounded-xl bg-[#161d26] border border-slate-800 p-3.5 space-y-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-[#0f1419] border border-slate-700 flex items-center justify-center shrink-0">
                  {npc.permanenceUnlocked ? (
                    <Lock className="w-4 h-4 text-amber-400" title="Permanence Archived (100+ XP)" />
                  ) : (
                    <UserCheck className="w-4 h-4 text-teal-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">
                    {npc.name || npc.id}
                  </div>
                  <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded border font-mono text-[10px] ${tierMeta.color}`}>
                    {tierMeta.label}
                  </span>
                </div>
              </div>

              {npc.permanenceUnlocked && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[10px]">
                  <Sparkles className="w-3 h-3" /> PERMANENT
                </span>
              )}
            </div>

            {/* Relational XP Progress Bar (25 / 75 / 100 milestones) */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-mono text-slate-400">
                <span>Relational XP</span>
                <span className="text-slate-200">{xp} / 100</span>
              </div>
              <div className="relative h-2 rounded-full bg-[#0f1419] overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-teal-500 to-amber-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
                <span className="absolute top-0 bottom-0 left-[25%] w-px bg-slate-600" title="25 XP: Tier II" />
                <span className="absolute top-0 bottom-0 left-[75%] w-px bg-slate-600" title="75 XP: Tier I" />
              </div>
              <div className="flex justify-between text-[9px] font-mono text-slate-500">
                <span>0</span>
                <span>25 (T-II)</span>
                <span>75 (T-I)</span>
                <span>100 (PERM)</span>
              </div>
            </div>

            {rel && rel.STATUS === 'ACTIVE' && rel.currentGoal && (
              <div className="pt-2 border-t border-slate-800 text-xs text-slate-300 space-y-1">
                <div><span className="text-slate-500 font-mono">GOAL:</span> {rel.currentGoal}</div>
                {rel.coreBeliefs && (
                  <div><span className="text-slate-500 font-mono">BELIEF:</span> {rel.coreBeliefs}</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
