import React, { useEffect, useState } from 'react';
import { Lock, UserCheck, Sparkles, Users, Copy, Check } from 'lucide-react';
import { useGame } from '../context/GameContext';

const BOND_LABELS = {
  1: { label: 'Inner Circle', color: 'text-amber-300 border-amber-400/50 bg-amber-500/15' },
  2: { label: 'Trusted Ally', color: 'text-teal-300 border-teal-400/50 bg-teal-500/15' },
  3: { label: 'Acquaintance', color: 'text-slate-300 border-slate-600 bg-slate-800/60' },
  4: { label: 'Bystander', color: 'text-slate-400 border-slate-700 bg-slate-900' },
};

export default function SquadTab() {
  const { campaignState } = useGame();
  const npcs = campaignState?.activeEntities?.activeNPCs || [];
  const [copiedId, setCopiedId] = useState(null);
  const [imageMode, setImageMode] = useState(
    () => localStorage.getItem('delaval_image_mode') || 'prompt_only'
  );

  useEffect(() => {
    const sync = () => setImageMode(localStorage.getItem('delaval_image_mode') || 'prompt_only');
    window.addEventListener('delaval-image-mode-change', sync);
    return () => window.removeEventListener('delaval-image-mode-change', sync);
  }, []);

  const copyPrompt = async (npcId, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(npcId);
      setTimeout(() => setCopiedId(null), 1800);
    } catch (_) {}
  };

  if (npcs.length === 0) {
    return (
      <div className="rounded-xl bg-[#161d26] border border-slate-800 p-6 text-center space-y-2">
        <Users className="w-6 h-6 text-slate-500 mx-auto" />
        <div className="text-xs font-semibold text-slate-300">No Characters Met Yet</div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          As you meet allies, rivals, and key figures in your story, they will appear here with their bond progress and goals.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {npcs.map((npc) => {
        const bondMeta = BOND_LABELS[npc.currentTier] || BOND_LABELS[3];
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
                    <Lock className="w-4 h-4 text-amber-400" title="Locked into your story permanently" />
                  ) : (
                    <UserCheck className="w-4 h-4 text-teal-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">
                    {npc.name || npc.id}
                  </div>
                  <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded border font-mono text-[10px] ${bondMeta.color}`}>
                    {bondMeta.label}
                  </span>
                </div>
              </div>

              {npc.permanenceUnlocked && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[10px] shrink-0">
                  <Sparkles className="w-3 h-3" /> CORE CAST
                </span>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-mono text-slate-400">
                <span>Story Bond</span>
                <span className="text-slate-200">{xp} / 100</span>
              </div>
              <div className="relative h-2 rounded-full bg-[#0f1419] overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-teal-500 to-amber-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
                <span className="absolute top-0 bottom-0 left-[25%] w-px bg-slate-600" title="25: Trusted Ally" />
                <span className="absolute top-0 bottom-0 left-[75%] w-px bg-slate-600" title="75: Inner Circle" />
              </div>
              <div className="flex justify-between text-[9px] font-mono text-slate-500">
                <span>New</span>
                <span>25 Ally</span>
                <span>75 Close</span>
                <span>100 Core</span>
              </div>
            </div>

            {rel && rel.STATUS === 'ACTIVE' && rel.currentGoal && (
              <div className="pt-2 border-t border-slate-800 text-xs text-slate-300 space-y-1">
                <div><span className="text-slate-500 font-mono">MOTIVE:</span> {rel.currentGoal}</div>
                {rel.coreBeliefs && (
                  <div><span className="text-slate-500 font-mono">OUTLOOK:</span> {rel.coreBeliefs}</div>
                )}
              </div>
            )}

            {imageMode !== 'off' && npc.portraitPrompt && (
              <div className="pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => copyPrompt(npc.id, npc.portraitPrompt)}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0f1419] border border-amber-500/40 hover:border-amber-400 text-[11px] font-mono text-amber-300 transition"
                >
                  {copiedId === npc.id ? (
                    <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copied Portrait Prompt!</>
                  ) : (
                    <><Copy className="w-3.5 h-3.5" /> Copy Portrait Art Prompt</>
                  )}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
