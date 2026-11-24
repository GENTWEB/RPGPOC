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
const { decryptToken, callNarratorLLM, callNarratorLLMWithThinking } = require('../services/llmGateway');

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
      ? 'gemma-4-26b-a4b-it'
      : provider === 'openai'
      ? 'gpt-4o-mini'
      : 'claude-sonnet-4-20250514';
  return {
    provider,
    accessToken,
    model: reqBody.model || defaultModel,
    thinkingLevel: reqBody.thinkingLevel === 'Max' ? 'Max' : 'Mid',
  };
}

router.get('/archetypes', (req, res) => res.json(loadArchetypes()));
router.get('/sjt-scenarios', (req, res) => res.json(generateSjtScenarios()));

/**
 * Lists completed Saved Stories separately from any in-progress Draft Setup
 * so unfinished setups never clutter the player's saved games list.
 */
router.get('/', async (req, res) => {
  try {
    const snap = await getDb()
      .collection('users')
      .doc(req.user.uid)
      .collection('campaigns')
      .get();

    const all = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          settingDescription: data.globalState?.settingDescription || 'Untitled World',
          rulesetMode: data.metaData?.rulesetMode || 'CLASSIC_D20',
          turnNumber: data.metaData?.turnNumber || 0,
          currentProcess: data.narratorState?.currentProcess || 'setup',
          currentStep: data.narratorState?.currentStep || 'ignition',
          setupCompleted: data.narratorState?.currentProcess === 'gameplayLoop',
          updatedAt: data.metaData?.timestamp || '',
        };
      })
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

    const campaigns = all.filter((c) => c.setupCompleted);
    const drafts = all.filter((c) => !c.setupCompleted);
    return res.json({
      campaigns,
      draftCampaign: drafts[0] || null,
      draftCount: drafts.length,
    });
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
    if (!doc.exists) return res.status(404).json({ error: 'Story not found.' });
    return res.json({ campaignState: doc.data() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/:campaignId', async (req, res) => {
  try {
    const ref = getCampaignRef(req.user.uid, req.params.campaignId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Story not found.' });
    await ref.delete();
    return res.json({ deleted: true, campaignId: req.params.campaignId });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:campaignId/setup/chat', async (req, res) => {
  return withHerokuKeepAlive(res, async () => {
    const ref = getCampaignRef(req.user.uid, req.params.campaignId);
    const doc = await ref.get();
    if (!doc.exists) throw new Error("Story not found.");

    const state = doc.data();
    const message = String(req.body?.message || '').trim();
    if (!message) throw new Error("Message is required.");

    const creds = await getUserLlmCreds(req.user.uid, req.body);
    if (!creds.accessToken) throw new Error("Connect your AI key first (top bar -> Connect AI).");

    const recentChat = (state.chatLog || [])
      .slice(-10)
      .map((m) => `${m.role.toUpperCase()}: ${m.text}`)
      .join('\n');

    const involvement = Number(req.body?.involvementLevel) || state.globalState?.involvementLevel || 1;
    state.globalState.involvementLevel = involvement;
    const prevSetupTurns = (state.chatLog || []).filter((m) => m.role === "narrator").length;

    let modeRule = "";
    if (involvement === 1) {
      modeRule = "MODE 1 (INFER EVERYTHING): Do NOT ask clarifying questions. Take the player\x27s pitch, infer all missing world details, factions, rules, and tone creatively in one vivid 120-160 word summary, and end by telling them to click \"Lock World & Continue\" to move to character creation.";
    } else if (involvement === 2) {
      const remaining = Math.max(0, 6 - prevSetupTurns * 3);
      modeRule = remaining > 0
        ? `MODE 2 (LIGHT Q&A): You may ask AT MOST ${Math.min(3, remaining)} concise clarifying questions (hard max 6 total across setup). If the player says "infer the rest" or "move on", ask ZERO questions and summarize the finished world so they can click "Lock World & Continue".`
        : "MODE 2 LIMIT REACHED: You have already asked your maximum of 6 questions. Ask ZERO more questions. Synthesize the final cohesive world now and tell the player to click \"Lock World & Continue\" to build their character.";
    } else {
      modeRule = "MODE 3 (REVERSE 20 QUESTIONS — SUGGESTIONS ONLY): Do NOT ask open-ended essay questions. Instead, propose ONE quick multiple-choice fork (e.g., Past vs Present vs Future, or Real World vs Sci-Fi vs Fantasy) and end your message with a final line formatted EXACTLY as: @CHOICES: Option A | Option B | Option C | Surprise Me";
    }

    const systemPrompt = `You are a creative, approachable Game Master helping a player set up a custom RPG world.
${modeRule}
HARD RULES:
- NEVER output planning notes, scratchpad outlines, or word counts—write ONLY your direct reply to the player.
- NEVER invent a separate character-building quiz during world setup—the app has its own dedicated Character Creation step right after "Lock World & Continue".`;

    const userPrompt = `CURRENT WORLD IDEA: ${state.globalState?.settingDescription || '(just starting)'}
CONVERSATION SO FAR:
${recentChat || '(first message)'}

PLAYER SAYS:
${message}`;

    const { text: reply, thinking } = await callNarratorLLMWithThinking({
      ...creds,
      systemPrompt,
      userPrompt,
    });

    const now = new Date().toISOString();
    state.chatLog = state.chatLog || [];
    state.chatLog.push({ id: `su_${Date.now()}`, role: 'player', text: message, timestamp: now });
    let cleanReply = reply;
    let choices = [];
    const choiceMatch = reply.match(/@CHOICES:\s*(.+)$/im);
    if (choiceMatch) {
      choices = choiceMatch[1].split("|").map((s) => s.trim()).filter(Boolean).slice(0, 5);
      cleanReply = reply.replace(/@CHOICES:\s*.+$/im, "").trim();
    }
    state.chatLog.push({ id: `sn_${Date.now() + 1}`, role: "narrator", text: cleanReply, choices, thinking: thinking || null, timestamp: now });

    if (!state.globalState.settingDescription) {
      state.globalState.settingDescription = message;
    }
    state.metaData.timestamp = now;

    await ref.set(state);
    return { reply, thinking, campaignState: state };
  });
});

router.post('/:campaignId/setup/sjt/generate', async (req, res) => {
  try {
    const ref = getCampaignRef(req.user.uid, req.params.campaignId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Story not found.' });

    const state = doc.data();
    const stage = req.body?.stage === 'adaptive' ? 'adaptive' : 'foundation';
    const count = Math.min(15, Math.max(3, Number(req.body?.count) || 5));
    const previousAnswers = Array.isArray(req.body?.previousAnswers) ? req.body.previousAnswers : [];

    const creds = await getUserLlmCreds(req.user.uid, req.body);
    if (!creds.accessToken) {
      return res.status(400).json({ error: 'Connect your AI key first (top bar -> Connect AI).' });
    }

    const setupTranscript = (state.chatLog || [])
      .slice(-12)
      .map((m) => `${m.role}: ${m.text}`)
      .join('\n');

    const systemPrompt = `Create bespoke "What would you do?" character-building scenarios rooted strictly in this player's custom world.
Return ONLY valid JSON (no markdown fences, no commentary):
{
  "scenarios": [
    {
      "id": "sjt_1",
      "prompt": "A vivid 1-2 sentence situation in this exact world.",
      "choices": [
        { "label": "Choice A", "leaning": "intellect" },
        { "label": "Choice B", "leaning": "agility" },
        { "label": "Choice C", "leaning": "charisma" },
        { "label": "Choice D", "leaning": "strength" }
      ]
    }
  ]
}
Allowed leaning values ONLY: "strength", "agility", "intellect", "charisma", "perception", "constitution", "luck".`;

    const userPrompt = `WORLD: ${state.globalState?.settingDescription}
TECH/MAGIC: ${state.globalState?.techLevel}
VIBE: ${state.globalState?.narratorStyle}
BRAINSTORM CHAT:
${setupTranscript}
STAGE: ${stage} (generate exactly ${count} scenarios)
PRIOR ANSWERS: ${JSON.stringify(previousAnswers)}`;

    const raw = await callNarratorLLM({ ...creds, systemPrompt, userPrompt });
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed.scenarios) || parsed.scenarios.length === 0) {
      throw new Error('Model returned an empty scenario list.');
    }
    return res.json({ stage, scenarios: parsed.scenarios });
  } catch (err) {
    return res.status(500).json({ error: `Could not generate personality scenarios: ${err.message}` });
  }
});

router.post('/:campaignId/setup/:step', async (req, res) => {
  return withHerokuKeepAlive(res, async () => {
    const ref = getCampaignRef(req.user.uid, req.params.campaignId);
    const doc = await ref.get();
    if (!doc.exists) throw new Error('Story not found.');

    const result = advanceSetupStep(doc.data(), req.params.step, req.body || {});
    if (!result.ok) throw new Error(result.error || 'Setup step failed.');

    if (result.ignited) {
      const creds = await getUserLlmCreds(req.user.uid, req.body);
      if (creds.accessToken) {
        try {
          const bootToon = encodeOutboundToon({
            campaignState: result.campaignState,
            chronoSeedValue: result.campaignState.metaData?.chronoSeedInitial || 14,
            manifestRows: [],
            flags: { primacyLock: true },
            userVerbatim: 'WORLD_IGNITION: Open the story right in the middle of an evocative scene built strictly from our setup conversation, and end on a clear hook for the player.',
          });
          const systemPrompt = buildNarratorSystemPrompt(result.campaignState);
          const { text: raw, thinking } = await callNarratorLLMWithThinking({
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
            (parsed.ok && parsed.meta?.sceneLog?.sum) || 'The adventure begins.';
          result.campaignState.chatLog = result.campaignState.chatLog || [];
          result.campaignState.chatLog.push({
            id: 'n_0_ignition',
            role: 'narrator',
            text: openingText,
            thinking: thinking || null,
            modelUsed: creds.model || null,
            timestamp: new Date().toISOString(),
          });
        } catch (llmErr) {
          if (/503|429|UNAVAILABLE|overloaded|high demand|rate.?limit|quota|timeout/i.test(String(llmErr?.message || ""))) {
            throw llmErr;
          }
          result.campaignState.chatLog = result.campaignState.chatLog || [];
          result.campaignState.chatLog.push({
            id: 'sys_ignition_err',
            role: 'system',
            text: `Your world is ready, but the opening scene hit a snag: ${llmErr.message}`,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    result.campaignState.metaData.timestamp = new Date().toISOString();
    await ref.set(result.campaignState);
    if (result.ignited) {
      await ref.collection('snapshots').doc('0').set({
        turnNumber: 0,
        createdAt: new Date().toISOString(),
        state: result.campaignState,
      });
    }

    return result;
  });
});

module.exports = router;
