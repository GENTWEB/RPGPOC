'use strict';

const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../config/firebaseAdmin');
const { createInitialCampaignState } = require('../config/constants');
const {
  loadArchetypes,
  generateSjtScenarios,
  advanceSetupStep,
} = require('../engine/setupMachine');

const router = express.Router();

function getCampaignRef(uid, campaignId) {
  return getDb().collection('users').doc(uid).collection('campaigns').doc(campaignId);
}

router.get('/archetypes', (req, res) => {
  return res.json(loadArchetypes());
});

router.get('/sjt-scenarios', (req, res) => {
  return res.json(generateSjtScenarios());
});

router.get('/', async (req, res) => {
  try {
    const snap = await getDb()
      .collection('users')
      .doc(req.user.uid)
      .collection('campaigns')
      .get();

    const campaigns = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        settingDescription: data.globalState?.settingDescription || 'New Campaign',
        rulesetMode: data.metaData?.rulesetMode || 'CLASSIC_D20',
        turnNumber: data.metaData?.turnNumber || 0,
        currentStep: data.narratorState?.currentStep || 'ignition',
        updatedAt: data.metaData?.timestamp || null,
      };
    });
    return res.json({ campaigns });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const campaignId = `cmp_${crypto.randomBytes(6).toString('hex')}`;
    const state = createInitialCampaignState({
      campaignId,
      ownerUid: req.user.uid,
      rulesetMode: req.body?.rulesetMode,
    });
    await getCampaignRef(req.user.uid, campaignId).set(state);
    await getCampaignRef(req.user.uid, campaignId)
      .collection('snapshots')
      .doc('0')
      .set({ turnNumber: 0, createdAt: new Date().toISOString(), state });

    return res.status(201).json({ campaignId, campaignState: state });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/:campaignId', async (req, res) => {
  try {
    const doc = await getCampaignRef(req.user.uid, req.params.campaignId).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }
    return res.json({ campaignState: doc.data() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:campaignId/setup/:step', async (req, res) => {
  try {
    const ref = getCampaignRef(req.user.uid, req.params.campaignId);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    const result = advanceSetupStep(doc.data(), req.params.step, req.body || {});
    if (!result.ok) {
      return res.status(400).json(result);
    }

    await ref.set(result.campaignState);
    if (result.ignited) {
      await ref.collection('snapshots').doc('0').set({
        turnNumber: 0,
        createdAt: new Date().toISOString(),
        state: result.campaignState,
      });
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
