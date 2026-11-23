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
const { buildNarratorSystemPrompt } = require('../engine/narratorPrompt');
const { encodeOutboundToon, parseWithOneShotRepair } = require('../services/toonCodec');
const { decryptToken, callNarratorLLM } = require('../services/llmGateway');

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

    // On world_ignition, immediately invoke the connected LLM to synthesize the opening scene
    if (result.ignited) {
      const vaultDoc = await getDb()
        .collection('users')
        .doc(req.user.uid)
        .collection('profile')
        .doc('oauth_vault')
        .get();
      const vault = vaultDoc.exists ? vaultDoc.data() : {};
      const byokKey = decryptToken(vault.byokKeyEnc);
      const provider = vault.byokProvider || 'gemini';
      const model = req.body?.model || (provider === 'gemini' ? 'gemini-2.5-flash' : provider === 'openai' ? 'gpt-4o-mini' : 'claude-sonnet-4-20250514');
      const thinkingLevel = req.body?.thinkingLevel || 'Mid';

      if (byokKey) {
        try {
          const bootToon = encodeOutboundToon({
            campaignState: result.campaignState,
            chronoSeedValue: result.campaignState.metaData?.chronoSeedInitial || 14,
            manifestRows: [],
            flags: { primacyLock: true },
            userVerbatim: 'WORLD_IGNITION: Synthesize the opening scene strictly from our setup parameters, introduce the immediate sensory environment, and end on a concrete tension hook.',
          });
          const systemPrompt = buildNarratorSystemPrompt(result.campaignState);
          const raw = await callNarratorLLM({
            provider,
            accessToken: byokKey,
            model,
            thinkingLevel,
            systemPrompt,
            userPrompt: bootToon,
          });
          const parsed = await parseWithOneShotRepair(raw, async (badRaw, errMsg) =>
            callNarratorLLM({
              provider,
              accessToken: byokKey,
              model,
              thinkingLevel,
              systemPrompt,
              userPrompt: `REPAIR REQUIRED (${errMsg}). Re-emit valid ---TOON_META--- and ---NARRATIVE--- sections:\n${badRaw}`,
            })
          );
          const openingText = parsed.ok ? parsed.narrative : raw;
          result.campaignState.sceneMemory.currentScene.summary =
            (parsed.ok && parsed.meta?.sceneLog?.sum) || 'Campaign world ignited.';
          result.campaignState.chatLog = result.campaignState.chatLog || [];
          result.campaignState.chatLog.push({
            id: 'n_0_ignition',
            role: 'narrator',
            text: openingText,
            timestamp: new Date().toISOString(),
          });
        } catch (llmErr) {
          result.campaignState.chatLog = result.campaignState.chatLog || [];
          result.campaignState.chatLog.push({
            id: 'sys_ignition_err',
            role: 'system',
            text: `World ignited, but opening narration failed: ${llmErr.message}`,
            timestamp: new Date().toISOString(),
          });
        }
      }
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
