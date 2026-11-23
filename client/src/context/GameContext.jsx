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
  const [selectedModel, setSelectedModel] = useState('google/gemini-2.5-flash');
  const [thinkingLevel, setThinkingLevel] = useState('Mid');
  const [campaigns, setCampaigns] = useState([]);
  const [campaignState, setCampaignState] = useState(null);
  const [pendingPortrait, setPendingPortrait] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [oocDrawerOpen, setOocDrawerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
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
        setSelectedModel((prev) => prev || catalog.models[0].id);
      }
      setCampaigns(campList.campaigns || []);
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
        // Check for OpenRouter OAuth PKCE callback code in URL
        const params = new URLSearchParams(window.location.search);
        const orCode = params.get('code');
        if (orCode) {
          try {
            await apiClient.exchangeOpenRouterCode(orCode);
            window.history.replaceState({}, document.title, window.location.pathname);
            notify('Connected AI Provider via OpenRouter OAuth PKCE.', 'success');
          } catch (err) {
            notify(`OpenRouter OAuth failed: ${err.message}`, 'error');
          }
        }
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
      notify('Signed in with Google & Drive sync enabled.', 'success');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleConnectAIProvider = async () => {
    try {
      const callbackUrl = `${window.location.origin}${window.location.pathname}`;
      const { authUrl } = await apiClient.startOpenRouterOAuth(callbackUrl);
      window.location.href = authUrl;
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleSignOut = async () => {
    await logoutUser();
    setCampaignState(null);
  };

  const startNewCampaign = async (rulesetMode = 'CLASSIC_D20') => {
    setBusy(true);
    try {
      const res = await apiClient.createCampaign(rulesetMode);
      setCampaignState(res.campaignState);
      setPendingPortrait(null);
      await refreshCatalogAndCampaigns();
      notify('New campaign initialized.', 'success');
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
      setCampaignState(res.campaignState);
      notify('Campaign loaded from Firestore.', 'success');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const submitTurn = async (userInput, tacticalAction = null) => {
    if (!campaignState || !userInput.trim()) return;
    setBusy(true);
    try {
      const res = await apiClient.sendTurn(campaignState.id, {
        userInput,
        tacticalAction,
        model: selectedModel,
        thinkingLevel,
      });
      if (res.campaignState) {
        setCampaignState(res.campaignState);
      }
      if (res.type === 'INVENTORY_GATE_BLOCK') {
        notify(res.narrative, 'warn');
      } else if (res.systemMessage) {
        notify(res.systemMessage, 'info');
      }
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const rewind = async (steps = 1) => {
    if (!campaignState) return;
    setBusy(true);
    try {
      const res = await apiClient.rewindTurn(campaignState.id, steps);
      setCampaignState(res.campaignState);
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
      setCampaignState(res.campaignState);
      notify(`Fast-forwarded to Turn ${res.restoredTurn}.`, 'info');
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
        : 'Saved to Firestore Cloud (connect Google Drive for external backup).';
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
    try {
      const res = await apiClient.generatePortrait(campaignState.id, {
        uploadedBase64,
        inferAppearanceFromImage,
      });
      setPendingPortrait(res);
      notify('Full-body portrait ready for approval.', 'info');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const approvePortraitAndIgnite = async () => {
    if (!campaignState || !pendingPortrait?.portrait?.storagePath) return;
    setBusy(true);
    try {
      const approval = await apiClient.advanceSetup(campaignState.id, 'portrait_approval', {
        approved: true,
        portraitRef: pendingPortrait.portrait.storagePath,
        inferredPhysicalTraits: pendingPortrait.inferredPhysicalTraits,
      });
      const ignited = await apiClient.advanceSetup(campaignState.id, 'world_ignition', {});
      setCampaignState(ignited.campaignState || approval.campaignState);
      setPendingPortrait(null);
      notify('Portrait approved. World ignited!', 'success');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
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
    campaignState,
    setCampaignState,
    pendingPortrait,
    setPendingPortrait,
    lightboxImage,
    setLightboxImage,
    oocDrawerOpen,
    setOocDrawerOpen,
    busy,
    statusToast,
    notify,
    handleGoogleSignIn,
    handleConnectAIProvider,
    handleSignOut,
    startNewCampaign,
    loadCampaign,
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
