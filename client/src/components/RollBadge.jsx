import React from 'react';
import { Dices, Brain, Sparkles, AlertTriangle } from 'lucide-react';

export default function RollBadge({ roll }) {
  if (!roll) return null;

  const isPsych = typeof roll.composure === 'number';
  const isCritSuccess = roll.crit === 'CRIT_SUCCESS' || roll.crit === 'COMPOSURE_BREAKTHROUGH';
  const isCritFail = roll.crit === 'CRIT_FAIL' || roll.crit === 'CRIT_FAIL_SOFTENED';

  return (
    <div
      className={`mt-2 inline-flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg border font-mono text-xs ${
        isCritSuccess
          ? 'bg-amber-500/15 border-amber-400/60 text-amber-200'
          : isCritFail
          ? 'bg-red-500/15 border-red-400/60 text-red-200'
          : 'bg-[#0f1419] border-slate-700 text-slate-300'
      }`}
    >
      {isPsych ? (
        <Brain className="w-3.5 h-3.5 text-teal-400" />
      ) : (
        <Dices className="w-3.5 h-3.5 text-amber-400" />
      )}

      <span className="font-semibold text-white">{roll.check}</span>

      {isPsych ? (
        <>
          <span>Composure {roll.composure} vs {roll.taskThreshold}</span>
          <span className="text-teal-300">Env: {roll.envFallout} ({roll.envRoll})</span>
        </>
      ) : (
        <>
          <span>
            d20({roll.nat}) {roll.mod >= 0 ? `+${roll.mod}` : roll.mod} = <strong>{roll.total}</strong>
          </span>
          {roll.dc && <span className="text-slate-400">vs DC {roll.dc}</span>}
        </>
      )}

      <span
        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
          roll.outcome === 'SUCCESS' || roll.outcome === 'COMPOSED_SUCCESS'
            ? 'bg-teal-500/20 text-teal-300'
            : 'bg-red-500/20 text-red-300'
        }`}
      >
        {roll.outcome}
      </span>

      {roll.luckNudge && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px]">
          <Sparkles className="w-3 h-3" /> LUCK NUDGE
        </span>
      )}

      {roll.encumbered && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-900/50 text-red-300 text-[10px]">
          <AlertTriangle className="w-3 h-3" /> ENCUMBERED
        </span>
      )}

      {isCritSuccess && (
        <span className="px-1.5 py-0.5 rounded bg-amber-500 text-[#0f1419] text-[10px] font-bold">
          CRITICAL
        </span>
      )}
    </div>
  );
}
