'use strict';

const express = require('express');
const { getDb } = require('../config/firebaseAdmin');
const { encryptToken, decryptToken, fetchModelCatalog } = require('../services/llmGateway');

const router = express.Router();

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const ALLOWED_PROVIDERS = new Set(['gemini', 'openai', 'anthropic']);

/**
 * Saves the user's personal BYOK API key encrypted with AES-256-GCM
 * strictly inside their private Firestore oauth_vault (never localStorage).
 */
router.post('/byok', async (req, res) => {
  try {
    const provider = String(req.body?.provider || 'gemini').toLowerCase();
    const apiKey = String(req.body?.apiKey || '').trim();
    if (!ALLOWED_PROVIDERS.has(provider)) {
      return res.status(400).json({ error: 'Provider must be gemini, openai, or anthropic.' });
    }
    if (!apiKey || apiKey.length < 10) {
      return res.status(400).json({ error: 'Please enter a valid API key.' });
    }

    const encrypted = encryptToken(apiKey);
    const db = getDb();
    await db
      .collection('users')
      .doc(req.user.uid)
      .collection('profile')
      .doc('oauth_vault')
      .set(
        {
          byokProvider: provider,
          byokKeyEnc: encrypted,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

    const catalog = await fetchModelCatalog({ provider, accessToken: apiKey });
    return res.json({ connected: true, ...catalog });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/google/session', async (req, res) => {
  try {
    const { googleAccessToken } = req.body || {};
    if (!googleAccessToken) {
      return res.status(400).json({ error: 'Missing Google OAuth access token.' });
    }
    const encrypted = encryptToken(googleAccessToken);
    res.cookie('dl_google_token', encrypted, COOKIE_OPTS);

    const db = getDb();
    await db
      .collection('users')
      .doc(req.user.uid)
      .collection('profile')
      .doc('oauth_vault')
      .set(
        {
          googleTokenEnc: encrypted,
          driveConnected: true,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

    return res.json({ connected: true, driveScope: 'https://www.googleapis.com/auth/drive.file' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/models', async (req, res) => {
  try {
    const db = getDb();
    const vaultDoc = await db
      .collection('users')
      .doc(req.user.uid)
      .collection('profile')
      .doc('oauth_vault')
      .get();
    const vault = vaultDoc.exists ? vaultDoc.data() : {};

    const byokKey = decryptToken(vault.byokKeyEnc);
    const gToken = decryptToken(req.cookies?.dl_google_token || vault.googleTokenEnc);

    if (byokKey) {
      const catalog = await fetchModelCatalog({
        provider: vault.byokProvider || 'gemini',
        accessToken: byokKey,
      });
      return res.json({ ...catalog, driveConnected: Boolean(gToken) });
    }

    return res.json({
      provider: null,
      connected: false,
      driveConnected: Boolean(gToken),
      models: [],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/disconnect', async (req, res) => {
  res.clearCookie('dl_google_token');
  const db = getDb();
  await db
    .collection('users')
    .doc(req.user.uid)
    .collection('profile')
    .doc('oauth_vault')
    .set({ byokKeyEnc: null, byokProvider: null, googleTokenEnc: null, driveConnected: false }, { merge: true });
  return res.json({ disconnected: true });
});

module.exports = router;
