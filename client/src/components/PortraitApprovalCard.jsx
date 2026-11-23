import React, { useState } from 'react';
import { CheckCircle2, RefreshCw, Upload, Lock } from 'lucide-react';
import { useGame } from '../context/GameContext';

export default function PortraitApprovalCard() {
  const {
    pendingPortrait,
    generateCharacterPortrait,
    approvePortraitAndIgnite,
    busy,
  } = useGame();
  const [inferAppearance, setInferAppearance] = useState(true);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      generateCharacterPortrait(reader.result, inferAppearance);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="rounded-xl bg-[#161d26] border border-amber-500/40 p-5 space-y-4 shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-amber-400 font-mono text-xs font-semibold uppercase">
          <Lock className="w-4 h-4" />
          Head-to-Toe Character Portrait Approval Gate
        </div>
        <span className="text-[11px] font-mono text-slate-400">
          World ignition locked until approved
        </span>
      </div>

      {pendingPortrait?.portrait?.signedUrl ? (
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <img
            src={pendingPortrait.portrait.signedUrl}
            alt="Full-body character portrait preview"
            className="w-44 h-64 object-cover rounded-lg border border-slate-700 bg-[#0f1419]"
          />
          <div className="flex-1 space-y-3 text-sm text-slate-300">
            <p>
              Confirm this full-body portrait to lock your protagonist&apos;s likeness for all critical-moment graphic-novel panels.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={approvePortraitAndIgnite}
                disabled={busy}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-[#0f1419] font-semibold text-xs"
              >
                <CheckCircle2 className="w-4 h-4" />
                Approve &amp; Ignite World
              </button>
              <button
                onClick={() => generateCharacterPortrait(null, false)}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0f1419] border border-slate-700 hover:border-amber-500 text-slate-200 text-xs"
              >
                <RefreshCw className="w-4 h-4" />
                Regenerate
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-300">
            Generate a head-to-toe portrait from your character sheet or upload a reference photo.
          </p>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={inferAppearance}
              onChange={(e) => setInferAppearance(e.target.checked)}
              className="rounded border-slate-600 bg-[#0f1419] text-amber-500"
            />
            Infer physicalTraits automatically from uploaded photo
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => generateCharacterPortrait(null, false)}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0f1419] font-semibold text-xs"
            >
              Generate Full-Body Portrait
            </button>
            <label className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0f1419] border border-slate-700 hover:border-teal-400 text-slate-200 text-xs">
              <Upload className="w-3.5 h-3.5" />
              Upload Reference Photo
              <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
