import React from 'react';
import { MapPin, Layers, Activity, Flag } from 'lucide-react';
import { useGame } from '../context/GameContext';

export default function LoreTelemetryTab() {
  const { campaignState } = useGame();
  if (!campaignState) {
    return (
      <div className="text-xs font-mono text-slate-500 text-center py-10">
        No active campaign telemetry.
      </div>
    );
  }

  const scene = campaignState.sceneMemory?.currentScene || {};
  const prevScenes = (campaignState.sceneMemory?.previousScenes || []).slice(-3);
  const quests = Object.entries(campaignState.worldState?.activeMainQuests || {});
  const factions = Object.entries(campaignState.worldState?.factions || {});
  const tier1Npcs = (campaignState.activeEntities?.activeNPCs || []).filter((n) => n.currentTier === 1);

  return (
    <div className="space-y-4">
      {/* Current Location Brief */}
      <div className="p-3.5 rounded-xl bg-[#161d26] border border-slate-800 space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-mono text-amber-400 uppercase">
          <MapPin className="w-3.5 h-3.5" /> {scene.locationId || 'loc_origin'}
        </div>
        <div className="text-[11px] font-mono text-slate-400">
          {scene.timeAndDate || campaignState.globalState?.dateTime || 'Time Undeclared'} · Mood: {scene.mood || 'Tense'}
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          {scene.summary || 'Awaiting world ignition narration...'}
        </p>
      </div>

      {/* Rule of 4 Scene Cards */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase text-slate-400">
          <Layers className="w-3.5 h-3.5 text-teal-400" /> Rule-of-4 Hot Memory ({prevScenes.length}/3 Prev)
        </div>
        {prevScenes.length === 0 ? (
          <div className="text-xs text-slate-500 italic">No prior scenes archived in hot buffer yet.</div>
        ) : (
          prevScenes.map((s, idx) => (
            <div key={s.id || idx} className="p-2.5 rounded-lg bg-[#161d26] border border-slate-800 text-xs text-slate-300">
              <span className="font-mono text-teal-400 mr-1.5">[{s.id || `s_${idx + 1}`}]</span>
              {s.summary}
            </div>
          ))
        )}
      </div>

      {/* Active Quests & Factions */}
      {(quests.length > 0 || factions.length > 0) && (
        <div className="p-3.5 rounded-xl bg-[#161d26] border border-slate-800 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase text-amber-400">
            <Flag className="w-3.5 h-3.5" /> Quests &amp; Factions
          </div>
          {quests.map(([k, v]) => (
            <div key={k} className="text-xs text-slate-300">
              <strong className="text-white">{k}:</strong> {String(v)}
            </div>
          ))}
          {factions.map(([k, v]) => (
            <div key={k} className="text-xs text-teal-300 font-mono">
              {k}: {typeof v === 'object' ? JSON.stringify(v) : String(v)}
            </div>
          ))}
        </div>
      )}

      {/* Live 9-Axis Prism Gauges for Tier I NPCs */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase text-slate-400">
          <Activity className="w-3.5 h-3.5 text-amber-400" /> 9-Axis Prism Engine (Tier I NPCs)
        </div>
        {tier1Npcs.length === 0 ? (
          <div className="text-xs text-slate-500 italic">
            Unlock a Tier I NPC (75+ Relational XP) to view live 9-Axis Prism telemetry.
          </div>
        ) : (
          tier1Npcs.map((npc) => {
            const matrix = npc.genetics?.tier_1_agency?.['9_axis_matrix'] || {};
            return (
              <div key={npc.id} className="p-3 rounded-xl bg-[#161d26] border border-amber-500/30 space-y-2">
                <div className="text-xs font-mono font-bold text-amber-300">{npc.name || npc.id}</div>
                <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
                  {Object.entries(matrix).map(([axis, val]) => (
                    <div key={axis} className="p-1.5 rounded bg-[#0f1419] border border-slate-800">
                      <div className="text-slate-500 truncate" title={axis}>
                        {axis.split('_')[0]}:{axis.split('_')[1]?.slice(0, 4)}
                      </div>
                      <div className="text-teal-300 font-bold">{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
