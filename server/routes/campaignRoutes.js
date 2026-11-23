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

async function getUserLlmCreds(uid, reqBody = {}) {
  const vaultDoc = await getDb()
    .collection('users')
    .doc(uid)
    .collection('profile')
    .doc('oauth_vault')
    .get();
  const vault = vaultDoc.exists ? vaultDoc.data() : {};
  const accessToken = decryptToken(vault.byokKeyEnc);
  const provider = vault.byokProvider || 'gemini';
  const defaultModel =
    provider === 'gemini'
      ? 'gemini-3.8-flash'
      : provider === 'openai'
      ? 'gpt-4o-mini'
      : 'claude-sonnet-4-20250514';
  return {
    provider,
    accessToken,
    model: reqBody.model || defaultModel,
    thinkingLevel: reqBody.thinkingLevel || 'Mid',
  };
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
    if (!doc.exists) return res.status(404).json({ error: 'Campaign not found.' });
    return res.json({ campaignState: doc.data() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Conversational Procedural Worldbuilding during Setup:
 * Lets the player brainstorm mashups (e.g. "Harry Potter meets Project Hail Mary")
 * directly with Gemini so Gemini reconciles contradictions and asks tailored follow-ups.
 */
router.post('/:campaignId/setup/chat', async (req, res) => {
  try {
    const ref = getCampaignRef(req.user.uid, req.params.campaignId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Campaign not found.' });

    const state = doc.data();
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Message is required.' });

    const creds = await getUserLlmCreds(req.user.uid, req.body);
    if (!creds.accessToken) {
      return res.status(400).json({ error: 'Connect your AI key first (top bar -> Connect AI).' });
    }

    const recentChat = (state.chatLog || [])
      .slice(-10)
      .map((m) => `${m.role.toUpperCase()}: ${m.text}`)
      .join('\n');

    const systemPrompt = `You are the Procedural Worldbuilding Architect for the De Laval Narrative RPG Engine (v7.2).
Your job is to co-create a completely bespoke, non-cookie-cutter setting WITH the player during setup.
- If the player pitches a mashup or contradiction (e.g. "Harry Potter meets Project Hail Mary"), enthusiastically propose 1-2 clever, grounded in-universe ways those genres fuse logically.
- Ask 2-3 tight, evocative follow-up questions tailored strictly to their pitch (e.g. how tech & magic interact, era/date, narrator tone/influences, or core tension).
- Never use generic boilerplate. Keep replies vivid, concise (under 180 words), and immediately actionable so the player can either keep refining or click Confirm Setting.`;

    const userPrompt = `CURRENT SETUP STAGE: ${state.narratorState?.currentStep}
CURRENT SETTING DRAFT: ${state.globalState?.settingDescription || '(none yet)'}
RECENT SETUP CHAT:
${recentChat || '(first message)'}

PLAYER INPUT:
${message}`;

    const reply = await callNarratorLLM({
      ...creds,
      systemPrompt,
      userPrompt,
    });

    const now = new Date().toISOString();
    state.chatLog = state.chatLog || [];
    state.chatLog.push({ id: `su_${Date.now()}`, role: 'player', text: message, timestamp: now });
    state.chatLog.push({ id: `sn_${Date.now() + 1}`, role: 'narrator', text: reply, timestamp: now });

    // Capture the first pitch into settingDescription if still blank
    if (!state.globalState.settingDescription) {
      state.globalState.settingDescription = message;
    }

    await ref.set(state);
    return res.json({ reply, campaignState: state });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Procedurally generates world-themed Situational Judgement Test (SJT) scenarios
 * using Gemini based on the exact synthesized world and setup conversation.
 */
router.post('/:campaignId/setup/sjt/generate', async (req, res) => {
  try {
    const ref = getCampaignRef(req.user.uid, req.params.campaignId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Campaign not found.' });

    const state = doc.data();
    const stage = req.body?.stage === 'adaptive' ? 'adaptive' : 'foundation';
    const count = Math.min(15, Math.max(3, Number(req.body?.count) || (stage === 'foundation' ? 5 : 5)));
    const previousAnswers = Array.isArray(req.body?.previousAnswers) ? req.body.previousAnswers : [];

    const creds = await getUserLlmCreds(req.user.uid, req.body);
    if (!creds.accessToken) {
      return res.status(400).json({ error: 'Connect your AI key first (top bar -> Connect AI).' });
    }

    const setupTranscript = (state.chatLog || [])
      .slice(-12)
      .map((m) => `${m.role}: ${m.text}`)
      .join('\n');

    const systemPrompt = `You generate bespoke, world-native Situational Judgement Test (SJT) dilemmas for the De Laval RPG Engine.
Return ONLY valid JSON (no markdown fences, no commentary) matching this exact schema:
{
  "scenarios": [
    {
      "id": "sjt_1",
      "prompt": "A vivid 1-2 sentence dilemma rooted strictly in this exact world.",
      "choices": [
        { "label": "Action A", "leaning": "intellect" },
        { "label": "Action B", "leaning": "agility" },
        { "label": "Action C", "leaning": "charisma" },
        { "label": "Action D", "leaning": "strength" }
      ]
    }
  ]
}
Allowed leaning values ONLY: "strength", "agility", "intellect", "charisma", "perception", "constitution", "luck".
Zero generic fantasy/sci-fi boilerplate—every dilemma must reference the specific mashup, tech/magic rules, and tone of this campaign.`;

    const userPrompt = `WORLD SETTING: ${state.globalState?.settingDescription}
TECH LEVEL: ${state.globalState?.techLevel}
NARRATOR STYLE: ${state.globalState?.narratorStyle}
SETUP CONVERSATION:
${setupTranscript}

STAGE: ${stage} (generate exactly ${count} scenarios)
PRIOR PLAYER SJT ANSWERS: ${JSON.stringify(previousAnswers)}`;

    const raw = await callNarratorLLM({
      ...creds,
      systemPrompt,
      userPrompt,
    });

    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed.scenarios) || parsed.scenarios.length === 0) {
      throw new Error('Model returned an empty SJT scenario list.');
    }

    return res.json({ stage, scenarios: parsed.scenarios });
  } catch (err) {
    return res.status(500).json({ error: `Failed to generate themed SJT: ${err.message}` });
  }
});

router.post('/:campaignId/setup/:step', async (req, res) => {
  try {
    const ref = getCampaignRef(req.user.uid, req.params.campaignId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Campaign not found.' });

    const result = advanceSetupStep(doc.data(), req.params.step, req.body || {});
    if (!result.ok) return res.status(400).json(result);

    if (result.ignited) {
      const creds = await getUserLlmCreds(req.user.uid, req.body);
      if (creds.accessToken) {
        try {
          const bootToon = encodeOutboundToon({
            campaignState: result.campaignState,
            chronoSeedValue: result.campaignState.metaData?.chronoSeedInitial || 14,
            manifestRows: [],
            flags: { primacyLock: true },
            userVerbatim: 'WORLD_IGNITION: Synthesize the opening scene strictly from our setup conversation and parameters, introduce the immediate sensory environment, and end on a concrete tension hook.',
          });
          const systemPrompt = buildNarratorSystemPrompt(result.campaignState);
          const raw = await callNarratorLLM({
            ...creds,
            systemPrompt,
            userPrompt: bootToon,
          });
          const parsed = await parseWithOneShotRepair(raw, async (badRaw, errMsg) =>
            callNarratorLLM({
              ...creds,
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
