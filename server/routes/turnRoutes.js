'use strict';

const express = require('express');
const { getDb } = require('../config/firebaseAdmin');
const { processTurn } = require('../engine/turnProcessor');
const { decryptToken, callNarratorLLM } = require('../services/llmGateway');
const { ArchivistService } = require('../services/archivistService');
const { MediaPipeline } = require('../services/mediaPipeline');
const { runPreSaveChecklist, upsertCampaignSaveToDrive } = require('../services/driveSyncService');

const router = express.Router();

async function withHerokuKeepAlive(res, asyncWork) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.flushHeaders();
  const timer = setInterval(() => {
    try { res.write(" "); } catch (_) {}
  }, 5000);
  try {
    const payload = await asyncWork();
    clearInterval(timer);
    return res.end(JSON.stringify(payload));
  } catch (err) {
    clearInterval(timer);
    return res.end(JSON.stringify({ error: err.message }));
  }
}


function buildSnapshotStore(uid, campaignId) {
  const snapsCol = getDb()
    .collection('users')
    .doc(uid)
    .collection('campaigns')
    .doc(campaignId)
    .collection('snapshots');

  return {
    async saveSnapshot(turnNum, state) {
      await snapsCol.doc(String(turnNum)).set({
        turnNumber: turnNum,
        createdAt: new Date().toISOString(),
        state,
      });
    },
    async getSnapshot(turnNum) {
      const doc = await snapsCol.doc(String(turnNum)).get();
      return doc.exists ? doc.data().state : null;
    },
    async getLatestSnapshot() {
      const snap = await snapsCol.orderBy('turnNumber', 'desc').limit(1).get();
      if (!snap.docs.length) return null;
      return snap.docs[0].data().state;
    },
  };
}

router.post('/:campaignId', async (req, res) => {
  return withHerokuKeepAlive(res, async () => {
    const uid = req.user.uid;
    const { campaignId } = req.params;
    const {
      userInput = '',
      tacticalAction = null,
      model = 'gemma-4-26b-a4b-it',
      thinkingLevel = 'Mid',
    } = req.body || {};

    const campaignRef = getDb().collection('users').doc(uid).collection('campaigns').doc(campaignId);
    const campaignDoc = await campaignRef.get();
    if (!campaignDoc.exists) throw new Error('Campaign not found.');

    const vaultDoc = await getDb().collection('users').doc(uid).collection('profile').doc('oauth_vault').get();
    const vault = vaultDoc.exists ? vaultDoc.data() : {};
    const byokKey = decryptToken(vault.byokKeyEnc);
    const googleToken = decryptToken(req.cookies?.dl_google_token || vault.googleTokenEnc);

    const provider = vault.byokProvider || "gemini";
    const accessToken = byokKey;

    const archivist = new ArchivistService();
    const mediaPipeline = new MediaPipeline({ archivist });
    const snapshotStore = buildSnapshotStore(uid, campaignId);

    const llmAdapter = {
      async complete({ systemPrompt, userPrompt }) {
        return callNarratorLLM({
          provider,
          accessToken,
          model,
          thinkingLevel,
          systemPrompt,
          userPrompt,
        });
      },
    };

    const saveHandler = async (state) => {
      const check = runPreSaveChecklist(state);
      await campaignRef.set(state);
      const driveRes = await upsertCampaignSaveToDrive({
        googleAccessToken: googleToken,
        campaignId,
        savePayload: check.payload,
      });
      return { checklistOk: check.ok, issues: check.issues, drive: driveRes };
    };

    const result = await processTurn({
      campaignState: campaignDoc.data(),
      userInput,
      tacticalAction,
      llmAdapter,
      snapshotStore,
      archivist,
      mediaPipeline,
      saveHandler,
    });

    if (result.mutatedState) {
      await campaignRef.set(result.campaignState);
    }

    return result;
  });
});

router.post('/:campaignId/rewind', async (req, res) => {
  try {
    const uid = req.user.uid;
    const { campaignId } = req.params;
    const steps = Math.max(1, Number(req.body?.steps) || 1);
    const campaignRef = getDb().collection('users').doc(uid).collection('campaigns').doc(campaignId);
    const doc = await campaignRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'Campaign not found.' });

    const currentTurn = doc.data().metaData?.turnNumber || 0;
    const targetTurn = Math.max(0, currentTurn - steps);
    const snapshotStore = buildSnapshotStore(uid, campaignId);
    const restored = await snapshotStore.getSnapshot(targetTurn);
    if (!restored) {
      return res.status(404).json({ error: `Snapshot for turn ${targetTurn} not found.` });
    }
    await campaignRef.set(restored);
    return res.json({ restoredTurn: targetTurn, campaignState: restored });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:campaignId/fast-forward', async (req, res) => {
  try {
    const uid = req.user.uid;
    const { campaignId } = req.params;
    const campaignRef = getDb().collection('users').doc(uid).collection('campaigns').doc(campaignId);
    const snapshotStore = buildSnapshotStore(uid, campaignId);
    const latest = await snapshotStore.getLatestSnapshot();
    if (!latest) return res.status(404).json({ error: 'No snapshots recorded.' });
    await campaignRef.set(latest);
    return res.json({ restoredTurn: latest.metaData.turnNumber, campaignState: latest });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
