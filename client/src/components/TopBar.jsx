import React, { useState } from 'react';
import {
  RotateCcw,
  FastForward,
  CloudUpload,
  Terminal,
  Sparkles,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { useGame } from '../context/GameContext';

export default function TopBar() {
  const {
    user,
    providerStatus,
    selectedModel,
    setSelectedModel,
    thinkingLevel,
    setThinkingLevel,
    campaignState,
    oocDrawerOpen,
    setOocDrawerOpen,
    busy,
    rewind,
    fastForward,
    saveCloudAndDrive,
    byokModalOpen,
    setByokModalOpen,
    saveByokKey,
    handleConnectAIProvider,
    handleSignOut,
  } = useGame();

  const [byokProvider, setByokProvider] = useState('gemini');
  const [byokKeyInput, setByokKeyInput] = useState('');
  const ruleset = campaignState?.metaData?.rulesetMode || 'CLASSIC_D20';
  const currentModelObj = providerStatus.models?.find((m) => m.id === selectedModel);
  const allowedThinking = currentModelObj?.thinkingLevels || ['Low', 'Mid', 'Max'];

  return (
    <>
    <header className="h-14 shrink-0 px-4 bg-[#161d26] border-b border-slate-800 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_#f59e0b]" />
          <span className="font-mono font-bold tracking-wider text-sm text-amber-400 whitespace-nowrap">
            DE LAVAL // ENGINE v7.2
          </span>
        </div>

        <span className="px-2 py-0.5 rounded text-[11px] font-mono uppercase border border-teal-500/40 bg-teal-500/10 text-teal-300">
          {ruleset === 'PSYCH_REALISM' ? 'Psych Realism' : 'd20'}
        </span>

        {campaignState && (
          <span className="hidden md:inline text-xs font-mono text-slate-400">
            TURN {campaignState.metaData?.turnNumber ?? 0}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Dynamic Model Selector */}
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          disabled={!providerStatus.connected}
          className="bg-[#0f1419] border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-200 max-w-[180px] focus:outline-none focus:border-amber-500"
          title="Select AI Model (dynamically filtered by account tier)"
        >
          {providerStatus.models?.length > 0 ? (
            providerStatus.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.tier})
              </option>
            ))
          ) : (
            <option value="google/gemini-2.5-flash">Connect AI Provider</option>
          )}
        </select>

        {/* Thinking Level Selector */}
        <select
          value={thinkingLevel}
          onChange={(e) => setThinkingLevel(e.target.value)}
          className="bg-[#0f1419] border border-slate-700 rounded px-2 py-1 text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-500"
          title="Reasoning / Thinking Depth"
        >
          {allowedThinking.map((lvl) => (
            <option key={lvl} value={lvl}>
              Think: {lvl}
            </option>
          ))}
        </select>

        {/* Rewind & FastForward */}
        <button
          onClick={() => rewind(1)}
          disabled={busy || !campaignState}
          className="p-1.5 rounded bg-[#0f1419] border border-slate-700 text-slate-300 hover:border-amber-500 hover:text-amber-400 disabled:opacity-40"
          title="Rewind 1 Turn (Snapshot Restore)"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          onClick={fastForward}
          disabled={busy || !campaignState}
          className="p-1.5 rounded bg-[#0f1419] border border-slate-700 text-slate-300 hover:border-teal-400 hover:text-teal-300 disabled:opacity-40"
          title="FastForward to Latest Snapshot"
        >
          <FastForward className="w-4 h-4" />
        </button>

        {/* Save Cloud + Drive */}
        <button
          onClick={saveCloudAndDrive}
          disabled={busy || !campaignState}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-amber-500/15 border border-amber-500/50 text-amber-300 hover:bg-amber-500/25 text-xs font-mono disabled:opacity-40"
        >
          <CloudUpload className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Save (Cloud + Drive)</span>
        </button>

        {/* OOC Drawer Toggle */}
        <button
          onClick={() => setOocDrawerOpen(!oocDrawerOpen)}
          className={`p-1.5 rounded border text-xs font-mono ${
            oocDrawerOpen
              ? 'bg-teal-500/20 border-teal-400 text-teal-300'
              : 'bg-[#0f1419] border-slate-700 text-slate-300 hover:border-slate-500'
          }`}
          title="Toggle OOC Command Drawer"
        >
          <Terminal className="w-4 h-4" />
        </button>

        {/* Provider / Profile Pill */}
        {!providerStatus.connected ? (
          <button
            onClick={handleConnectAIProvider}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-teal-500/20 border border-teal-400/60 text-teal-200 hover:bg-teal-500/30 text-xs font-mono"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Connect AI
          </button>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0f1419] border border-slate-700 text-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
            <span className="hidden xl:inline text-slate-300 max-w-[110px] truncate">
              {user?.displayName || user?.email}
            </span>
          </div>
        )}

        <button
          onClick={handleSignOut}
          className="p-1.5 rounded bg-[#0f1419] border border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-500/50"
          title="Sign Out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
    {byokModalOpen && (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl bg-[#161d26] border border-slate-700 p-5 space-y-4 shadow-2xl">
          <h3 className="text-sm font-mono font-bold text-amber-400 uppercase">Connect Your Personal AI Key (BYOK)</h3>
          <p className="text-xs text-slate-300">
            Encrypted with AES-256-GCM in your private Firestore vault. Usage stays 100% on your own account.
          </p>
          <div className="space-y-2 text-xs">
            <label className="block text-slate-400">Provider</label>
            <select
              value={byokProvider}
              onChange={(e) => setByokProvider(e.target.value)}
              className="w-full rounded bg-[#0f1419] border border-slate-700 px-3 py-2 text-slate-100"
            >
              <option value="gemini">Google Gemini (AI Studio - Free Tier Available)</option>
              <option value="openai">OpenAI (ChatGPT API)</option>
              <option value="anthropic">Anthropic (Claude API)</option>
            </select>
            <label className="block text-slate-400 pt-1">API Key</label>
            <input
              type="password"
              value={byokKeyInput}
              onChange={(e) => setByokKeyInput(e.target.value)}
              placeholder={byokProvider === "gemini" ? "AIza..." : byokProvider === "openai" ? "sk-..." : "sk-ant-..."}
              className="w-full rounded bg-[#0f1419] border border-slate-700 px-3 py-2 text-slate-100 font-mono"
            />
            {byokProvider === "gemini" && (
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="inline-block text-teal-400 underline pt-1"
              >
                Get a free Gemini API key in Google AI Studio
              </a>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setByokModalOpen(false)}
              className="px-3 py-1.5 rounded bg-[#0f1419] border border-slate-700 text-xs text-slate-300"
            >
              Cancel
            </button>
            <button
              disabled={busy || !byokKeyInput.trim()}
              onClick={async () => {
                await saveByokKey(byokProvider, byokKeyInput);
                setByokKeyInput("");
              }}
              className="px-4 py-1.5 rounded bg-amber-500 text-[#0f1419] font-semibold text-xs disabled:opacity-40"
            >
              Save Encrypted Key
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
