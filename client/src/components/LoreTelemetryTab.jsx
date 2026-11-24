import React from 'react';
import { MapPin, BookOpen, Flag, Users } from 'lucide-react';
import { useGame } from '../context/GameContext';

export default function LoreTelemetryTab() {
  const { campaignState } = useGame();
  if (!campaignState) {
    return (
      <div className="text-xs text-slate-500 text-center py-10">
        Start or load a story to see your world notes.
      </div>
    );
  }

  const scene = campaignState.sceneMemory?.currentScene || {};
  const prevScenes = (campaignState.sceneMemory?.previousScenes || []).slice(-3);
  const quests = Object.entries(campaignState.worldState?.activeMainQuests || {});
  const factions = Object.entries(campaignState.worldState?.factions || {});
  const innerCircle = (campaignState.activeEntities?.activeNPCs || []).filter((n) => n.currentTier === 1);

  return (
    <div className="space-y-4">
      <div className="p-3.5 rounded-xl bg-[#161d26] border border-slate-800 space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
          <MapPin className="w-3.5 h-3.5" /> Current Location
        </div>
        <div className="text-[11px] text-slate-400">
          {scene.timeAndDate || campaignState.globalState?.dateTime || 'Time unfolding'} · Mood: {scene.mood || 'Curious'}
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          {scene.summary || 'Your story is about to begin...'}
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
          <BookOpen className="w-3.5 h-3.5 text-teal-400" /> Story So Far
        </div>
        {prevScenes.length === 0 ? (
          <div className="text-xs text-slate-500 italic">Your recent story moments will appear here as you play.</div>
        ) : (
          prevScenes.map((s, idx) => (
            <div key={s.id || idx} className="p-2.5 rounded-lg bg-[#161d26] border border-slate-800 text-xs text-slate-300">
              {s.summary}
            </div>
          ))
        )}
      </div>

      {(quests.length > 0 || factions.length > 0) && (
        <div className="p-3.5 rounded-xl bg-[#161d26] border border-slate-800 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
            <Flag className="w-3.5 h-3.5" /> Active Goals &amp; Groups
          </div>
          {quests.map(([k, v]) => (
            <div key={k} className="text-xs text-slate-300">
              <strong className="text-white">{k}:</strong> {String(v)}
            </div>
          ))}
          {factions.map(([k, v]) => (
            <div key={k} className="text-xs text-teal-300">
              {k}: {typeof v === 'object' ? JSON.stringify(v) : String(v)}
            </div>
          ))}
        </div>
      )}

      {innerCircle.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <Users className="w-3.5 h-3.5 text-amber-400" /> Inner Circle Bonds
          </div>
          {innerCircle.map((npc) => (
            <div key={npc.id} className="p-3 rounded-xl bg-[#161d26] border border-amber-500/30 space-y-1">
              <div className="text-xs font-semibold text-amber-300">{npc.name || npc.id}</div>
              <div className="text-xs text-slate-300">
                {npc.genetics?.tier_2_relational?.currentGoal || 'Standing by your side.'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
