cat << 'EOF' > client/src/components/TopBar.jsx
import React, { useState } from 'react';
import {
  RotateCcw,
  FastForward,
  CloudUpload,
  Terminal,
  Sparkles,
  LogOut,
  ShieldCheck,
  ExternalLink,
  HelpCircle,
  Menu,
  Home,
  Play,
  X,
  ChevronDown,
} from 'lucide-react';
import { useGame } from '../context/GameContext';

const BYOK_GUIDES = {
  gemini: {
    label: 'Google Gemini (AI Studio)',
    placeholder: 'AIza...',
    linkText: 'Open Google AI Studio API Keys',
    url: 'https://aistudio.google.com/apikey',
    badge: 'Free tier available',
    steps: [
      'Click the Google AI Studio link above and sign in with your Google account.',
      'Click "Create API key" (create or select a default project if prompted).',
      'Copy the key starting with "AIza..." and paste it below.',
    ],
  },
  openai: {
    label: 'OpenAI (ChatGPT API)',
    placeholder: 'sk-proj-...',
    linkText: 'Open OpenAI Platform API Keys',
    url: 'https://platform.openai.com/api-keys',
    badge: 'Requires API credits (separate from ChatGPT Plus)',
    steps: [
      'Open OpenAI Platform above and sign in (add a small prepaid balance under Settings -> Billing if new).',
      'Click "+ Create new secret key", name it "De Laval RPG", and click Create.',
      'Copy the key starting with "sk-..." immediately and paste it below.',
    ],
  },
  anthropic: {
    label: 'Anthropic (Claude API)',
    placeholder: 'sk-ant-...',
    linkText: 'Open Anthropic Console API Keys',
    url: 'https://console.anthropic.com/settings/keys',
    badge: 'Requires API credits (separate from Claude Pro)',
    steps: [
      'Open the Anthropic Console above and sign in (add API credits under Plans & Billing if needed).',
      'Click "+ Create Key", select your workspace, and name it "De Laval RPG".',
      'Copy the key starting with "sk-ant-..." right away and paste it below.',
    ],
  },
};

export default function TopBar() {
  const {
    user,
    providerStatus,
    selectedModel,
    setSelectedModel,
    thinkingLevel,
    setThinkingLevel,
    campaignState,
    campaigns,
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
    navMenuOpen,
    setNavMenuOpen,
    returnToMainMenu,
    loadCampaign,
  } = useGame();

  const [byokProvider, setByokProvider] = useState('gemini');
  const [byokKeyInput, setByokKeyInput] = useState('');
  const [showGuide, setShowGuide] = useState(true);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  const ruleset = campaignState?.metaData?.rulesetMode || 'CLASSIC_D20';
  const models = providerStatus.models || [];
  const currentModelObj = models.find((m) => m.id === selectedModel) || models[0];
  const freeModels = models.filter((m) => m.tierGroup === 'free');
  const paidModels = models.filter((m) => m.tierGroup !== 'free');
  const activeGuide = BYOK_GUIDES[byokProvider] || BYOK_GUIDES.gemini;

  return (
    <>
      <header className="h-14 shrink-0 px-4 bg-[#161d26] border-b border-slate-800 flex items-center justify-between gap-3 relative z-30">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setNavMenuOpen(true)}
            className="p-1.5 rounded-lg bg-[#0f1419] border border-slate-700 hover:border-amber-500 text-slate-200"
            title="Open Navigation Menu (Main Menu, Stories, Settings)"
          >
            <Menu className="w-4 h-4" />
          </button>

          <button
            onClick={returnToMainMenu}
            className="flex items-center gap-2 text-left"
            title="Return to Main Menu"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_#f59e0b]" />
            <span className="font-mono font-bold tracking-wider text-sm text-amber-400 whitespace-nowrap">
              DE LAVAL // ENGINE v7.2
            </span>
          </button>

          <span className="px-2 py-0.5 rounded text-[11px] font-mono uppercase border border-teal-500/40 bg-teal-500/10 text-teal-300">
            {ruleset === 'PSYCH_REALISM' ? 'Deep Realism' : 'Dice & Tactics'}
          </span>

          {campaignState && (
            <span className="hidden md:inline text-xs font-mono text-slate-400">
              {campaignState.narratorState?.currentProcess === 'setup'
                ? 'SETUP'
                : `TURN ${campaignState.metaData?.turnNumber ?? 0}`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Rich GM Model Dropdown */}
          <div className="relative">
            <button
              onClick={() => setModelPickerOpen(!modelPickerOpen)}
              disabled={!providerStatus.connected}
              title="Choose your Game Master (GM) AI model"
              className="flex items-center gap-2 bg-[#0f1419] border border-slate-700 hover:border-amber-500 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 disabled:opacity-50"
            >
              <span className="px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px]">GM</span>
              <span className="max-w-[145px] truncate font-medium">
                {currentModelObj ? `${currentModelObj.speedIcon || '🚗'} ${currentModelObj.name}` : 'Connect AI'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {modelPickerOpen && models.length > 0 && (
              <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl bg-[#161d26] border border-slate-700 shadow-2xl p-2 space-y-2 z-50">
                {freeModels.length > 0 && (
                  <div className="space-y-1">
                    <div className="px-2 pt-1 text-[10px] font-mono uppercase text-teal-400">
                      Free Game Master Models
                    </div>
                    {freeModels.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setSelectedModel(m.id);
                          setModelPickerOpen(false);
                        }}
                        className={`w-full text-left p-2.5 rounded-lg border transition ${
                          m.id === selectedModel
                            ? 'bg-amber-500/15 border-amber-400/60'
                            : 'bg-[#0f1419] border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-white truncate">{m.name}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 font-mono text-[10px]">
                              {m.costLabel || 'FREE'}
                            </span>
                            <span className="text-xs" title={`Speed: ${m.speedScore || 7}/10`}>
                              {m.speedIcon || '🚗'}
                            </span>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 leading-snug">{m.description}</p>
                      </button>
                    ))}
                  </div>
                )}

                {paidModels.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-slate-800">
                    <div className="px-2 pt-1 text-[10px] font-mono uppercase text-amber-400">
                      Paid / Pro Game Master Models
                    </div>
                    {paidModels.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setSelectedModel(m.id);
                          setModelPickerOpen(false);
                        }}
                        className={`w-full text-left p-2.5 rounded-lg border transition ${
                          m.id === selectedModel
                            ? 'bg-amber-500/15 border-amber-400/60'
                            : 'bg-[#0f1419] border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-white truncate">{m.name}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px]">
                              {m.costLabel || 'PAID'}
                            </span>
                            <span className="text-xs" title={`Speed: ${m.speedScore || 7}/10`}>
                              {m.speedIcon || '✈️'}
                            </span>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 leading-snug">{m.description}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Thinking Depth: Mid / Max ONLY */}
          <select
            value={thinkingLevel === 'Max' ? 'Max' : 'Mid'}
            onChange={(e) => setThinkingLevel(e.target.value)}
            className="bg-[#0f1419] border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-500"
            title="Game Master reasoning depth (Mid or Max)"
          >
            <option value="Mid">Think: Mid</option>
            <option value="Max">Think: Max</option>
          </select>

          <button
            onClick={() => rewind(1)}
            disabled={busy || !campaignState}
            className="p-1.5 rounded bg-[#0f1419] border border-slate-700 text-slate-300 hover:border-amber-500 hover:text-amber-400 disabled:opacity-40"
            title="Undo last turn (Rewind)"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={fastForward}
            disabled={busy || !campaignState}
            className="p-1.5 rounded bg-[#0f1419] border border-slate-700 text-slate-300 hover:border-teal-400 hover:text-teal-300 disabled:opacity-40"
            title="Jump forward to latest turn"
          >
            <FastForward className="w-4 h-4" />
          </button>

          <button
            onClick={saveCloudAndDrive}
            disabled={busy || !campaignState}
            title="Save your story to the Cloud & Google Drive"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-amber-500/15 border border-amber-500/50 text-amber-300 hover:bg-amber-500/25 text-xs font-mono disabled:opacity-40"
          >
            <CloudUpload className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Save</span>
          </button>

          <button
            onClick={() => setOocDrawerOpen(!oocDrawerOpen)}
            className={`p-1.5 rounded border text-xs font-mono ${
              oocDrawerOpen
                ? 'bg-teal-500/20 border-teal-400 text-teal-300'
                : 'bg-[#0f1419] border-slate-700 text-slate-300 hover:border-slate-500'
            }`}
            title="Show quick game commands"
          >
            <Terminal className="w-4 h-4" />
          </button>

          {!providerStatus.connected ? (
            <button
              onClick={handleConnectAIProvider}
              title="Connect your personal Gemini, OpenAI, or Claude key"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-teal-500/20 border border-teal-400/60 text-teal-200 hover:bg-teal-500/30 text-xs font-mono"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Connect AI
            </button>
          ) : (
            <button
              onClick={handleConnectAIProvider}
              title="Switch AI provider or update your personal API key"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0f1419] border border-slate-700 hover:border-amber-500/60 text-xs"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
              <span className="hidden xl:inline text-slate-300 max-w-[120px] truncate">
                {user?.displayName || user?.email}
              </span>
            </button>
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

      {/* Borderlands-2 Style Quick-Exit Hamburger Navigation Drawer */}
      {navMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex"
          onClick={() => setNavMenuOpen(false)}
        >
          <div
            className="w-72 bg-[#161d26] border-r border-slate-800 p-5 flex flex-col justify-between"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="font-mono font-bold text-amber-400 text-sm">MENU</span>
                <button onClick={() => setNavMenuOpen(false)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-2 text-sm">
                <button
                  onClick={returnToMainMenu}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[#0f1419] hover:border-amber-500 border border-slate-800 text-slate-200"
                >
                  <Home className="w-4 h-4 text-amber-400" /> Main Menu (New / Load)
                </button>
                {campaignState && (
                  <button
                    onClick={() => setNavMenuOpen(false)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[#0f1419] hover:border-teal-400 border border-slate-800 text-slate-200"
                  >
                    <Play className="w-4 h-4 text-teal-400" /> Back to Current Story
                  </button>
                )}
                {!campaignState && campaigns?.[0] && (
                  <button
                    onClick={() => loadCampaign(campaigns[0].id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[#0f1419] hover:border-teal-400 border border-slate-800 text-slate-200"
                  >
                    <Play className="w-4 h-4 text-teal-400" /> Continue Most Recent
                  </button>
                )}
                <button
                  onClick={() => {
                    setNavMenuOpen(false);
                    handleConnectAIProvider();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[#0f1419] hover:border-amber-500 border border-slate-800 text-slate-200"
                >
                  <Sparkles className="w-4 h-4 text-amber-400" /> AI Provider &amp; Keys
                </button>
              </div>
            </div>
            <div className="text-xs text-slate-400 border-t border-slate-800 pt-3">
              Mode:{' '}
              <span className="text-teal-300 font-medium">
                {campaignState
                  ? campaignState.narratorState?.currentProcess === 'setup'
                    ? 'Setting Up World'
                    : 'Playing Story'
                  : 'Main Menu'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* BYOK Modal */}
      {byokModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-[#161d26] border border-slate-700 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-mono font-bold text-amber-400 uppercase">
                Connect Your Personal AI Key
              </h3>
              <span className="px-2 py-0.5 rounded bg-teal-500/15 border border-teal-500/30 text-[10px] font-mono text-teal-300">
                Encrypted Vault
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Provider</label>
                <select
                  value={byokProvider}
                  onChange={(e) => setByokProvider(e.target.value)}
                  className="w-full rounded-lg bg-[#0f1419] border border-slate-700 px-3 py-2 text-slate-100"
                >
                  <option value="gemini">Google Gemini &amp; Gemma (Free Tier Available)</option>
                  <option value="openai">OpenAI (ChatGPT API)</option>
                  <option value="anthropic">Anthropic (Claude API)</option>
                </select>
              </div>

              <div className="rounded-xl bg-[#0f1419] border border-slate-800 p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <a
                    href={activeGuide.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-teal-400 hover:text-teal-300 font-semibold underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {activeGuide.linkText}
                  </a>
                  <span className="text-[10px] font-mono text-amber-300/90">{activeGuide.badge}</span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowGuide(!showGuide)}
                  className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  {showGuide ? 'Hide steps' : 'How to get a key'}
                </button>

                {showGuide && (
                  <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-300 pt-1">
                    {activeGuide.steps.map((stepText, idx) => (
                      <li key={idx}>{stepText}</li>
                    ))}
                  </ol>
                )}
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Paste Your {activeGuide.label} Key</label>
                <input
                  type="password"
                  value={byokKeyInput}
                  onChange={(e) => setByokKeyInput(e.target.value)}
                  placeholder={activeGuide.placeholder}
                  className="w-full rounded-lg bg-[#0f1419] border border-slate-700 px-3 py-2 text-slate-100 font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setByokModalOpen(false)}
                className="px-3.5 py-2 rounded-lg bg-[#0f1419] border border-slate-700 text-xs text-slate-300"
              >
                Cancel
              </button>
              <button
                disabled={busy || !byokKeyInput.trim()}
                onClick={async () => {
                  await saveByokKey(byokProvider, byokKeyInput);
                  setByokKeyInput('');
                }}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0f1419] font-semibold text-xs disabled:opacity-40"
              >
                Save Key
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
EOF