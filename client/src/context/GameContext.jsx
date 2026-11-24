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
  const [involvementLevel, setInvolvementLevel] = useState(1);
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
      return false;
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
            involvementLevel,
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
      return true;
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
    involvementLevel,
    setInvolvementLevel,
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
