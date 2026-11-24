'use strict';

const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../config/firebaseAdmin');
const { encryptToken, decryptToken } = require('../services/llmGateway');
const { runPreSaveChecklist, upsertCampaignSaveToDrive } = require('../services/driveSyncService');

const router = express.Router();

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitizeUploadedObject(val, depth = 0) {
  if (depth > 12) throw new Error('Save file nesting depth exceeded.');
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map((item) => sanitizeUploadedObject(item, depth + 1));
  const clean = {};
  for (const [k, v] of Object.entries(val)) {
    if (FORBIDDEN_KEYS.has(k)) continue;
    clean[k] = sanitizeUploadedObject(v, depth + 1);
  }
  return clean;
}

router.post('/:campaignId/export', async (req, res) => {
  try {
    const uid = req.user.uid;
    const { campaignId } = req.params;
    const ref = getDb().collection('users').doc(uid).collection('campaigns').doc(campaignId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Story not found.' });

    const state = doc.data();
    const check = runPreSaveChecklist(state);
    await ref.set({ ...state, metaData: check.payload.metaData });

    const vaultDoc = await getDb().collection('users').doc(uid).collection('profile').doc('oauth_vault').get();
    const vault = vaultDoc.exists ? vaultDoc.data() : {};
    const googleToken = decryptToken(req.cookies?.dl_google_token || vault.googleTokenEnc);

    let driveSync = { synced: false, reason: 'Google Drive not connected.' };
    if (googleToken) {
      driveSync = await upsertCampaignSaveToDrive({
        googleAccessToken: googleToken,
        campaignId,
        savePayload: check.payload,
      });
    }

    // Encrypt downloadable file so internal schema/prompts are protected
    const encryptedEnvelope = {
      format: 'DELAVAL_ENC_V1',
      version: '7.2',
      exportedAt: new Date().toISOString(),
      payload: encryptToken(JSON.stringify(check.payload)),
    };

    return res.json({
      savedToCloud: true,
      checklistOk: check.ok,
      issues: check.issues,
      driveSync,
      encryptedSave: encryptedEnvelope,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/import', async (req, res) => {
  try {
    const uid = req.user.uid;
    const rawBody = req.body?.savePayload;
    if (!rawBody || typeof rawBody !== 'object') {
      return res.status(400).json({ error: 'Invalid or empty save file.' });
    }

    const sizeBytes = Buffer.byteLength(JSON.stringify(rawBody), 'utf8');
    if (sizeBytes > 2 * 1024 * 1024) {
      return res.status(413).json({ error: 'Save file exceeds 2 MB safety limit.' });
    }

    let decoded = rawBody;
    if (rawBody.format === 'DELAVAL_ENC_V1' && typeof rawBody.payload === 'string') {
      try {
        decoded = JSON.parse(decryptToken(rawBody.payload));
      } catch (_) {
        return res.status(400).json({ error: 'Could not decrypt .delaval save file (corrupted or wrong key).' });
      }
    }

    const safePayload = sanitizeUploadedObject(decoded);
    if (safePayload.metaData?.project !== 'Integrated_De_Laval_Engine') {
      return res.status(400).json({ error: 'File failed safety vetting: not a valid De Laval save.' });
    }

    const campaignId = `cmp_${crypto.randomBytes(6).toString('hex')}`;
    const importedState = {
      ...safePayload,
      id: campaignId,
      ownerUid: uid,
      chatLog: Array.isArray(safePayload.chatLog) ? safePayload.chatLog : [],
    };

    const ref = getDb().collection('users').doc(uid).collection('campaigns').doc(campaignId);
    await ref.set(importedState);
    await ref
      .collection('snapshots')
      .doc(String(importedState.metaData?.turnNumber || 0))
      .set({
        turnNumber: importedState.metaData?.turnNumber || 0,
        createdAt: new Date().toISOString(),
        state: importedState,
      });

    return res.status(201).json({ campaignId, campaignState: importedState });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
