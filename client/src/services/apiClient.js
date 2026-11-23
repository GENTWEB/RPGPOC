import { auth } from './firebaseClient';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

async function authHeaders() {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : '';
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(path, options = {}) {
  const headers = await authHeaders();
  const resp = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error || data.message || `Request failed (${resp.status})`);
  }
  return data;
}

export const apiClient = {
  // Auth & Provider OAuth
  syncGoogleSession: (googleAccessToken) =>
    request('/auth/google/session', { method: 'POST', body: JSON.stringify({ googleAccessToken }) }),
  startOpenRouterOAuth: (callbackUrl) =>
    request('/auth/openrouter/start', { method: 'POST', body: JSON.stringify({ callbackUrl }) }),
  exchangeOpenRouterCode: (code) =>
    request('/auth/openrouter/exchange', { method: 'POST', body: JSON.stringify({ code }) }),
  saveByokKey: (provider, apiKey) => request('/auth/byok', { method: 'POST', body: JSON.stringify({ provider, apiKey }) }),
  getModels: () => request('/auth/models'),
  disconnectProviders: () => request('/auth/disconnect', { method: 'POST' }),

  // Campaigns & Setup State Machine
  listCampaigns: () => request('/campaigns'),
  createCampaign: (rulesetMode = 'CLASSIC_D20') =>
    request('/campaigns', { method: 'POST', body: JSON.stringify({ rulesetMode }) }),
  getCampaign: (campaignId) => request(`/campaigns/${campaignId}`),
  getArchetypes: () => request('/campaigns/archetypes'),
  getSjtScenarios: () => request('/campaigns/sjt-scenarios'),
  setupChat: (campaignId, payload) =>
    request(`/campaigns/${campaignId}/setup/chat`, { method: 'POST', body: JSON.stringify(payload) }),
  generateThemedSjt: (campaignId, payload) =>
    request(`/campaigns/${campaignId}/setup/sjt/generate`, { method: 'POST', body: JSON.stringify(payload) }),
  advanceSetup: (campaignId, step, payload) =>
    request(`/campaigns/${campaignId}/setup/${step}`, { method: 'POST', body: JSON.stringify(payload) }),

  // Turn Execution & Snapshots
  sendTurn: (campaignId, payload) =>
    request(`/turns/${campaignId}`, { method: 'POST', body: JSON.stringify(payload) }),
  rewindTurn: (campaignId, steps = 1) =>
    request(`/turns/${campaignId}/rewind`, { method: 'POST', body: JSON.stringify({ steps }) }),
  fastForwardTurn: (campaignId) =>
    request(`/turns/${campaignId}/fast-forward`, { method: 'POST' }),

  // Media Vault (Private 15-min signed URLs)
  generatePortrait: (campaignId, payload) =>
    request(`/media/${campaignId}/portrait`, { method: 'POST', body: JSON.stringify(payload) }),
  generatePanel: (campaignId, brief) =>
    request(`/media/${campaignId}/panel`, { method: 'POST', body: JSON.stringify({ brief }) }),
  getSignedUrl: (storagePath) =>
    request(`/media/signed-url?path=${encodeURIComponent(storagePath)}`),

  // Save Export & Import
  exportSave: (campaignId) => request(`/saves/${campaignId}/export`, { method: 'POST' }),
  importSave: (savePayload) =>
    request('/saves/import', { method: 'POST', body: JSON.stringify({ savePayload }) }),
};
