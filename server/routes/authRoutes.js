'use strict';

const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../config/firebaseAdmin');
const { encryptToken, decryptToken, fetchModelCatalog } = require('../services/llmGateway');

const router = express.Router();

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Initiates OpenRouter OAuth PKCE flow — returns authorization URL + challenge
 * while keeping code verifier in an HttpOnly, Secure, SameSite=Strict cookie.
 */
router.post('/openrouter/start', (req, res) => {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const callbackUrl = req.body.callbackUrl || `${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}/auth/openrouter/callback`;

  res.cookie('or_pkce_verifier', encryptToken(verifier), { ...COOKIE_OPTS, maxAge: 10 * 60 * 1000 });
  const authUrl = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(callbackUrl)}&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256`;

  return res.json({ authUrl });
});

/**
 * Exchanges OpenRouter OAuth PKCE code for an access token, storing it strictly in
 * an HttpOnly encrypted cookie + encrypted server profile record (never localStorage).
 */
router.post('/openrouter/exchange', async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code) {
      return res.status(400).json({ error: 'Missing OpenRouter authorization code.' });
    }
    const verifierEnc = req.cookies?.or_pkce_verifier;
    const verifier = decryptToken(verifierEnc);
    if (!verifier) {
      return res.status(400).json({ error: 'Expired or missing PKCE verifier cookie.' });
    }

    const resp = await fetch('https://openrouter.ai/api/v1/auth/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: verifier,
        code_challenge_method: 'S256',
      }),
    });

    if (!resp.ok) {
      return res.status(502).json({ error: `OpenRouter key exchange failed (${resp.status}).` });
    }

    const data = await resp.json();
    const apiKey = data.key;
    if (!apiKey) {
      return res.status(502).json({ error: 'OpenRouter did not return a key.' });
    }

    const encrypted = encryptToken(apiKey);
    res.clearCookie('or_pkce_verifier');
    res.cookie('dl_or_token', encrypted, COOKIE_OPTS);

    const db = getDb();
    await db
      .collection('users')
      .doc(req.user.uid)
      .collection('profile')
      .doc('oauth_vault')
      .set(
        {
          openrouterTokenEnc: encrypted,
          provider: 'openrouter',
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

    return res.json({ connected: true, provider: 'openrouter' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Stores Google OAuth access token (drive.file scope) strictly in an HttpOnly cookie
 * and encrypted server vault — never persisted in browser localStorage.
 */
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

/**
 * Queries the connected provider's model catalog dynamically so free/paid users
 * only see permitted models and thinking tiers (Low, Mid, Max).
 */
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

    const orToken = decryptToken(req.cookies?.dl_or_token || vault.openrouterTokenEnc);
    const gToken = decryptToken(req.cookies?.dl_google_token || vault.googleTokenEnc);

    if (orToken) {
      const catalog = await fetchModelCatalog({ provider: 'openrouter', accessToken: orToken });
      return res.json({ ...catalog, driveConnected: Boolean(gToken) });
    }
    if (gToken) {
      const catalog = await fetchModelCatalog({ provider: 'google', accessToken: gToken });
      return res.json({ ...catalog, driveConnected: true });
    }

    return res.json({
      provider: null,
      connected: false,
      driveConnected: false,
      models: [],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/disconnect', async (req, res) => {
  res.clearCookie('dl_or_token');
  res.clearCookie('dl_google_token');
  const db = getDb();
  await db
    .collection('users')
    .doc(req.user.uid)
    .collection('profile')
    .doc('oauth_vault')
    .set({ openrouterTokenEnc: null, googleTokenEnc: null, driveConnected: false }, { merge: true });
  return res.json({ disconnected: true });
});

module.exports = router;
