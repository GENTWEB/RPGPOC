import React, { useEffect, useState } from 'react';
import { Heart, Zap, Flame, Weight, Shield, User } from 'lucide-react';
import { useGame } from '../context/GameContext';
import { apiClient } from '../services/apiClient';

export default function InventoryTab() {
  const { campaignState, setLightboxImage } = useGame();
  const [portraitUrl, setPortraitUrl] = useState(null);

  const pc = campaignState?.activeEntities?.players?.[0];

  useEffect(() => {
    let active = true;
    if (pc?.approvedPortraitRef) {
      apiClient
        .getSignedUrl(pc.approvedPortraitRef)
        .then((res) => {
          if (active) setPortraitUrl(res.url);
        })
        .catch(() => {});
    } else {
      setPortraitUrl(null);
    }
    return () => {
      active = false;
    };
  }, [pc?.approvedPortraitRef]);

  if (!pc) {
    return (
      <div className="text-xs font-mono text-slate-500 text-center py-10">
        No active character loaded.
      </div>
    );
  }

  const cs = pc.combatStats || {};
  const attrs = pc.coreAttributes || {};
  const carried = pc.inventory?.carriedItems || [];
  const worn = pc.inventory?.wornClothing || [];
  const usedSlots = carried.reduce((sum, item) => sum + (Number(item.slots) || 0), 0);
  const maxSlots = Math.max(1, Number(attrs.strength) || 5);
  const encumbered = usedSlots > maxSlots;
  const encPct = Math.min(100, Math.round((usedSlots / maxSlots) * 100));

  return (
    <div className="space-y-4">
      {/* Approved Head-to-Toe Portrait Card */}
      <div className="rounded-xl bg-[#161d26] border border-slate-800 p-3 flex gap-3 items-center">
        {portraitUrl ? (
          <img
            src={portraitUrl}
            alt={pc.name}
            onClick={() => setLightboxImage({ signedUrl: portraitUrl, brief: `${pc.name} — Approved Full-Body Portrait` })}
            className="w-16 h-24 object-cover rounded-lg border border-amber-500/40 cursor-pointer shrink-0"
          />
        ) : (
          <div className="w-16 h-24 rounded-lg bg-[#0f1419] border border-slate-700 flex items-center justify-center shrink-0">
            <User className="w-6 h-6 text-slate-600" />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="font-bold text-white truncate">{pc.name || 'Operative'}</div>
          <div className="text-[11px] font-mono text-slate-400">
            AC {cs.armorClass ?? 10} · SPD {encumbered ? Math.floor((cs.movementSpeed || 30) / 2) : cs.movementSpeed ?? 30}ft · LUCK {cs.luckCharges ?? 0}
          </div>
          <div className="flex flex-wrap gap-1 pt-1">
            {cs.hunkered && (
              <span className="px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 text-[10px] font-mono">HUNKERED</span>
            )}
            {cs.overwatch && (
              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono">OVERWATCH</span>
            )}
          </div>
        </div>
      </div>

      {/* Health / AP / Stress Meters */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-lg bg-[#161d26] border border-slate-800">
          <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
            <Heart className="w-3 h-3 text-rose-400" /> HP
          </div>
          <div className="text-sm font-mono font-bold text-white mt-0.5">
            {cs.health ?? 100}/{cs.maxHealth ?? 100}
          </div>
        </div>
        <div className="p-2.5 rounded-lg bg-[#161d26] border border-slate-800">
          <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
            <Zap className="w-3 h-3 text-amber-400" /> AP
          </div>
          <div className="text-sm font-mono font-bold text-amber-300 mt-0.5">
            {cs.actionPoints ?? 2}/2
          </div>
        </div>
        <div className="p-2.5 rounded-lg bg-[#161d26] border border-slate-800">
          <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
            <Flame className="w-3 h-3 text-teal-400" /> STRESS
          </div>
          <div className="text-sm font-mono font-bold text-teal-300 mt-0.5">
            {cs.stressLevel ?? 0}
          </div>
        </div>
      </div>

      {/* Encumbrance Gauge (crimson when over STR capacity) */}
      <div className="p-3 rounded-xl bg-[#161d26] border border-slate-800 space-y-1.5">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="inline-flex items-center gap-1.5 text-slate-300">
            <Weight className="w-3.5 h-3.5 text-amber-400" /> Encumbrance
          </span>
          <span className={encumbered ? 'text-red-400 font-bold' : 'text-teal-300'}>
            {usedSlots} / {maxSlots} slots {encumbered ? '(OVER CAPACITY)' : ''}
          </span>
        </div>
        <div className="h-2 rounded-full bg-[#0f1419] overflow-hidden">
          <div
            className={`h-full transition-all ${encumbered ? 'bg-red-600' : 'bg-teal-500'}`}
            style={{ width: `${encPct}%` }}
          />
        </div>
      </div>

      {/* 7-Attribute Bar */}
      <div className="p-3 rounded-xl bg-[#161d26] border border-slate-800">
        <div className="text-[11px] font-mono uppercase text-slate-400 mb-2">Core Attributes</div>
        <div className="grid grid-cols-7 gap-1 text-center font-mono">
          {Object.entries(attrs).map(([k, v]) => (
            <div key={k} className="p-1.5 rounded bg-[#0f1419] border border-slate-800">
              <div className="text-[9px] uppercase text-slate-500">{k.slice(0, 3)}</div>
              <div className="text-xs font-bold text-amber-300">{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Worn Gear */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase text-slate-400">
          <Shield className="w-3.5 h-3.5 text-teal-400" /> Worn Gear (0 Slots)
        </div>
        <div className="space-y-1">
          {worn.length === 0 ? (
            <div className="text-xs text-slate-500 italic">None</div>
          ) : (
            worn.map((item, i) => (
              <div
                key={`${item.itemName}-${i}`}
                className="px-3 py-1.5 rounded-lg bg-[#161d26] border border-slate-800 text-xs flex justify-between"
              >
                <span className="text-slate-200">{item.itemName}</span>
                <span className="font-mono text-teal-400">WORN</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Carried Items */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-mono uppercase text-slate-400">Carried Items</div>
        <div className="space-y-1">
          {carried.length === 0 ? (
            <div className="text-xs text-slate-500 italic">Empty pack</div>
          ) : (
            carried.map((item, i) => (
              <div
                key={`${item.itemName}-${i}`}
                className="px-3 py-1.5 rounded-lg bg-[#161d26] border border-slate-800 text-xs flex justify-between items-center"
              >
                <span className="text-slate-200">{item.itemName}</span>
                <span className="font-mono text-[11px] text-amber-300">
                  {item.slots} {item.slots === 1 ? 'slot' : 'slots'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
