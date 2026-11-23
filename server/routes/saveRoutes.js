'use strict';

const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../config/firebaseAdmin');
const { decryptToken } = require('../services/llmGateway');
const { runPreSaveChecklist, upsertCampaignSaveToDrive } = require('../services/driveSyncService');

const router = express.Router();

router.post('/:campaignId/export', async (req, res) => {
  try {
    const uid = req.user.uid;
    const { campaignId } = req.params;
    const ref = getDb().collection('users').doc(uid).collection('campaigns').doc(campaignId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Campaign not found.' });

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

    return res.json({
      savedToCloud: true,
      checklistOk: check.ok,
      issues: check.issues,
      driveSync,
      savePayload: check.payload,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/import', async (req, res) => {
  try {
    const uid = req.user.uid;
    const payload = req.body?.savePayload;
    if (!payload || payload.metaData?.project !== 'Integrated_De_Laval_Engine') {
      return res.status(400).json({ error: 'Invalid De Laval v7.2 Synchronized Save JSON.' });
    }

    const campaignId = `cmp_${crypto.randomBytes(6).toString('hex')}`;
    const importedState = {
      ...payload,
      id: campaignId,
      ownerUid: uid,
      chatLog: payload.chatLog || [],
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
