# 2a. Add deleteCampaign to apiClient.js
node -e '
const fs = require("fs");
let api = fs.readFileSync("client/src/services/apiClient.js", "utf8");
if (!api.includes("deleteCampaign")) {
  api = api.replace(
    "getCampaign: (campaignId) => request(`/campaigns/${campaignId}`),",
    "getCampaign: (campaignId) => request(`/campaigns/${campaignId}`),\n  deleteCampaign: (campaignId) => request(`/campaigns/${campaignId}`, { method: \x27DELETE\x27 }),"
  );
  fs.writeFileSync("client/src/services/apiClient.js", api);
}
'

# 2b. Upgrade GameContext.jsx (optimistic chat messages, live thinking spinner state, draftCampaign, deleteCampaign, returnToMainMenu)
cat << 'EOF' > client/src/context/GameContext.jsx
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { subscribeAuth, signInWithGoogleDrive, logoutUser } from '../services/firebaseClient';
import { apiClient } from '../services/apiClient';

const GameContext = createContext(null);

export function GameProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [providerStatus, setProviderStatus] = useState({
    connected: false,
    provider: null,
    driveConnected: false,
    models: [],
  });
  const [selectedModel, setSelectedModel] = useState('gemini-3.8-flash');
  const [thinkingLevel, setThinkingLevel] = useState('Mid');
  const [campaigns, setCampaigns] = useState([]);
  const [draftCampaign, setDraftCampaign] = useState(null);
  const [campaignState, setCampaignState] = useState(null);
  const [pendingPortrait, setPendingPortrait] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [oocDrawerOpen, setOocDrawerOpen] = useState(false);
  const [byokModalOpen, setByokModalOpen] = useState(false);
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState(null);
  const [statusToast, setStatusToast] = useState(null);

  const notify = useCallback((message, tone = 'info') => {
    setStatusToast({ message, tone, id: Date.now() });
    setTimeout(() => {
      setStatusToast((prev) => (prev && prev.message === message ? null : prev));
    }, 4500);
  }, []);

  const refreshCatalogAndCampaigns = useCallback(async () => {
    try {
      const [catalog, campList] = await Promise.all([
        apiClient.getModels(),
        apiClient.listCampaigns(),
      ]);
      setProviderStatus(catalog);
      if (catalog.models?.length > 0) {
        setSelectedModel((prev) => (catalog.models.some((m) => m.id === prev) ? prev : catalog.models[0].id));
      }
      setCampaigns(campList.campaigns || []);
      setDraftCampaign(campList.draftCampaign || null);
    } catch (err) {
      notify(err.message, 'error');
    }
  }, [notify]);

  useEffect(() => {
    const unsub = subscribeAuth(async (fbUser) => {
      if (fbUser) {
        setUser({
          uid: fbUser.uid,
          email: fbUser.email,
          displayName: fbUser.displayName,
          photoURL: fbUser.photoURL,
        });
        await refreshCatalogAndCampaigns();
      } else {
        setUser(null);
        setCampaignState(null);
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, [refreshCatalogAndCampaigns, notify]);

  const handleGoogleSignIn = async () => {
    setBusy(true);
    try {
      const { googleAccessToken } = await signInWithGoogleDrive();
      if (googleAccessToken) {
        await apiClient.syncGoogleSession(googleAccessToken);
      }
      await refreshCatalogAndCampaigns();
      notify('Signed in with Google.', 'success');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleConnectAIProvider = () => setByokModalOpen(true);

  const saveByokKey = async (provider, apiKey) => {
    setBusy(true);
    try {
      const res = await apiClient.saveByokKey(provider, apiKey);
      setProviderStatus((prev) => ({ ...prev, ...res }));
      if (res.models?.length > 0) setSelectedModel(res.models[0].id);
      setByokModalOpen(false);
      notify(`Connected ${provider.toUpperCase()} cleanly.`, 'success');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    await logoutUser();
    setCampaignState(null);
    setNavMenuOpen(false);
  };

  const returnToMainMenu = async () => {
    setCampaignState(null);
    setPendingPortrait(null);
    setNavMenuOpen(false);
    await refreshCatalogAndCampaigns();
  };

  const startNewCampaign = async (rulesetMode = 'CLASSIC_D20') => {
    setBusy(true);
    try {
      const res = await apiClient.createCampaign(rulesetMode);
      setCampaignState({ ...res.campaignState });
      setPendingPortrait(null);
      setNavMenuOpen(false);
      await refreshCatalogAndCampaigns();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const loadCampaign = async (campaignId) => {
    setBusy(true);
    try {
      const res = await apiClient.getCampaign(campaignId);
      setCampaignState({ ...res.campaignState });
      setNavMenuOpen(false);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const deleteCampaign = async (campaignId) => {
    setBusy(true);
    try {
      await apiClient.deleteCampaign(campaignId);
      if (campaignState?.id === campaignId) {
        setCampaignState(null);
      }
      await refreshCatalogAndCampaigns();
      notify('Story deleted.', 'info');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const submitTurn = async (userInput, tacticalAction = null) => {
    if (!campaignState || !userInput.trim()) return;
    const isSetupMode = campaignState.narratorState?.currentProcess === 'setup';
    const optimisticId = `opt_${Date.now()}`;

    // Immediately show the player's message + live thinking spinner so the chat never feels frozen
    setCampaignState((prev) => ({
      ...prev,
      chatLog: [
        ...(prev.chatLog || []),
        { id: optimisticId, role: 'player', text: userInput, timestamp: new Date().toISOString() },
      ],
    }));
    setBusy(true);
    setThinkingStatus(isSetupMode ? 'Co-creating your world...' : 'Game Master is weaving the next scene...');

    try {
      const res = isSetupMode
        ? await apiClient.setupChat(campaignState.id, {
            message: userInput,
            model: selectedModel,
            thinkingLevel,
          })
        : await apiClient.sendTurn(campaignState.id, {
            userInput,
            tacticalAction,
            model: selectedModel,
            thinkingLevel,
          });
      if (res.campaignState) {
        setCampaignState({ ...res.campaignState });
      }
      if (res.type === 'INVENTORY_GATE_BLOCK') {
        notify(res.narrative, 'warn');
      } else if (res.systemMessage) {
        notify(res.systemMessage, 'info');
      }
    } catch (err) {
      // Remove optimistic message on failure so user can retry cleanly
      setCampaignState((prev) => ({
        ...prev,
        chatLog: (prev.chatLog || []).filter((m) => m.id !== optimisticId),
      }));
      notify(err.message, 'error');
    } finally {
      setBusy(false);
      setThinkingStatus(null);
    }
  };

  const rewind = async (steps = 1) => {
    if (!campaignState) return;
    setBusy(true);
    try {
      const res = await apiClient.rewindTurn(campaignState.id, steps);
      setCampaignState({ ...res.campaignState });
      notify(`Rewound to Turn ${res.restoredTurn}.`, 'info');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const fastForward = async () => {
    if (!campaignState) return;
    setBusy(true);
    try {
      const res = await apiClient.fastForwardTurn(campaignState.id);
      setCampaignState({ ...res.campaignState });
      notify(`Jumped back to Turn ${res.restoredTurn}.`, 'info');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveCloudAndDrive = async () => {
    if (!campaignState) return;
    setBusy(true);
    try {
      const res = await apiClient.exportSave(campaignState.id);
      const driveMsg = res.driveSync?.synced
        ? `Saved to Cloud & Google Drive (${res.driveSync.fileName}).`
        : 'Saved to Cloud.';
      notify(driveMsg, 'success');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const generateCharacterPortrait = async (uploadedBase64 = null, inferAppearanceFromImage = false) => {
    if (!campaignState) return;
    setBusy(true);
    setThinkingStatus('Painting your character portrait...');
    try {
      const res = await apiClient.generatePortrait(campaignState.id, {
        uploadedBase64,
        inferAppearanceFromImage,
      });
      setPendingPortrait(res);
      notify('Portrait ready for approval.', 'info');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
      setThinkingStatus(null);
    }
  };

  const approvePortraitAndIgnite = async () => {
    if (!campaignState || !pendingPortrait?.portrait?.storagePath) return;
    setBusy(true);
    setThinkingStatus('Opening your world for the first time...');
    try {
      const approval = await apiClient.advanceSetup(campaignState.id, 'portrait_approval', {
        approved: true,
        portraitRef: pendingPortrait.portrait.storagePath,
        inferredPhysicalTraits: pendingPortrait.inferredPhysicalTraits,
      });
      const ignited = await apiClient.advanceSetup(campaignState.id, 'world_ignition', {
        model: selectedModel,
        thinkingLevel,
      });
      setCampaignState({ ...(ignited.campaignState || approval.campaignState) });
      setPendingPortrait(null);
      await refreshCatalogAndCampaigns();
      notify('Welcome to your world!', 'success');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
      setThinkingStatus(null);
    }
  };

  const value = {
    user,
    authLoading,
    providerStatus,
    selectedModel,
    setSelectedModel,
    thinkingLevel,
    setThinkingLevel,
    campaigns,
    draftCampaign,
    campaignState,
    setCampaignState,
    pendingPortrait,
    setPendingPortrait,
    lightboxImage,
    setLightboxImage,
    oocDrawerOpen,
    setOocDrawerOpen,
    byokModalOpen,
    setByokModalOpen,
    navMenuOpen,
    setNavMenuOpen,
    busy,
    thinkingStatus,
    setThinkingStatus,
    statusToast,
    notify,
    handleGoogleSignIn,
    handleConnectAIProvider,
    saveByokKey,
    handleSignOut,
    returnToMainMenu,
    startNewCampaign,
    loadCampaign,
    deleteCampaign,
    submitTurn,
    rewind,
    fastForward,
    saveCloudAndDrive,
    generateCharacterPortrait,
    approvePortraitAndIgnite,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}
EOF

# 2c. Update TopBar.jsx with Borderlands-2 style Hamburger Menu + Mid/Max thinking only
node -e '
const fs = require("fs");
let tb = fs.readFileSync("client/src/components/TopBar.jsx", "utf8");
tb = tb.replace(
  "  HelpCircle,\n} from \x27lucide-react\x27;",
  "  HelpCircle,\n  Menu,\n  Home,\n  Play,\n  X,\n} from \x27lucide-react\x27;"
);
tb = tb.replace(
  "handleSignOut,\n  } = useGame();",
  "handleSignOut,\n    navMenuOpen,\n    setNavMenuOpen,\n    returnToMainMenu,\n    campaigns,\n    loadCampaign,\n  } = useGame();"
);
tb = tb.replace("[\x27Low\x27, \x27Mid\x27, \x27Max\x27]", "[\x27Mid\x27, \x27Max\x27]");
tb = tb.replace(
  `<div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_#f59e0b]" />`,
  `<button
            onClick={() => setNavMenuOpen(true)}
            className="p-1.5 rounded-lg bg-[#0f1419] border border-slate-700 hover:border-amber-500 text-slate-200"
            title="Open Navigation Menu"
          >
            <Menu className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">`
);
tb = tb.replace(
  "{byokModalOpen && (",
  `{navMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex" onClick={() => setNavMenuOpen(false)}>
          <div className="w-72 bg-[#161d26] border-r border-slate-800 p-5 flex flex-col justify-between" onClick={(e) => e.stopPropagation()}>
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="font-mono font-bold text-amber-400 text-sm">NAVIGATION</span>
                <button onClick={() => setNavMenuOpen(false)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-1.5 text-sm">
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
                    <Play className="w-4 h-4 text-teal-400" /> Return to Current Story
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
                  onClick={() => { setNavMenuOpen(false); handleConnectAIProvider(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[#0f1419] hover:border-amber-500 border border-slate-800 text-slate-200"
                >
                  <Sparkles className="w-4 h-4 text-amber-400" /> AI Provider &amp; Keys
                </button>
              </div>
            </div>
            <div className="text-[11px] font-mono text-slate-500 border-t border-slate-800 pt-3">
              Status: {campaignState ? (campaignState.narratorState?.currentProcess === "setup" ? "Setting Up World" : "Playing Story") : "Main Menu"}
            </div>
          </div>
        </div>
      )}

      {byokModalOpen && (`
);
fs.writeFileSync("client/src/components/TopBar.jsx", tb);
'

# 2d. Plain-English overhaul on LoreTelemetryTab.jsx (remove 9-Axis Prism & Hot Buffer jargon) and SquadTab.jsx
cat << 'EOF' > client/src/components/LoreTelemetryTab.jsx
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
EOF

cat << 'EOF' > client/src/components/SquadTab.jsx
import React from 'react';
import { Lock, UserCheck, Sparkles } from 'lucide-react';
import { useGame } from '../context/GameContext';

const BOND_LABELS = {
  1: { label: 'Inner Circle', color: 'text-amber-300 border-amber-400/50 bg-amber-500/15' },
  2: { label: 'Close Ally', color: 'text-teal-300 border-teal-400/50 bg-teal-500/15' },
  3: { label: 'Acquaintance', color: 'text-slate-300 border-slate-600 bg-slate-800/60' },
  4: { label: 'Passing Crowd', color: 'text-slate-400 border-slate-700 bg-slate-900' },
};

export default function SquadTab() {
  const { campaignState } = useGame();
  const npcs = campaignState?.activeEntities?.activeNPCs || [];

  if (npcs.length === 0) {
    return (
      <div className="text-xs text-slate-500 text-center py-10">
        Characters you meet along your journey will show up here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {npcs.map((npc) => {
        const bond = BOND_LABELS[npc.currentTier] || BOND_LABELS[3];
        const xp = Number(npc.relationalXP) || 0;
        const pct = Math.min(100, xp);
        const rel = npc.genetics?.tier_2_relational;

        return (
          <div key={npc.id} className="rounded-xl bg-[#161d26] border border-slate-800 p-3.5 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-[#0f1419] border border-slate-700 flex items-center justify-center shrink-0">
                  {npc.permanenceUnlocked ? (
                    <Lock className="w-4 h-4 text-amber-400" title="Unbreakable Bond" />
                  ) : (
                    <UserCheck className="w-4 h-4 text-teal-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{npc.name || npc.id}</div>
                  <span className={`inline-block mt-0.5 px-2 py-0.5 rounded border text-[10px] font-medium ${bond.color}`}>
                    {bond.label}
                  </span>
                </div>
              </div>
              {npc.permanenceUnlocked && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-medium">
                  <Sparkles className="w-3 h-3" /> Unbreakable
                </span>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Trust &amp; Bond</span>
                <span className="text-slate-200">{xp}%</span>
              </div>
              <div className="h-2 rounded-full bg-[#0f1419] overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-teal-500 to-amber-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {rel && rel.STATUS === 'ACTIVE' && rel.currentGoal && (
              <div className="pt-2 border-t border-slate-800 text-xs text-slate-300 space-y-1">
                <div><span className="text-slate-500">Goal:</span> {rel.currentGoal}</div>
                {rel.coreBeliefs && <div><span className="text-slate-500">Values:</span> {rel.coreBeliefs}</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
EOF