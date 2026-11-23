'use strict';

const crypto = require('crypto');

const THINKING_BUDGETS = Object.freeze({
  Low: { effort: 'low', max_tokens: 900 },
  Mid: { effort: 'medium', max_tokens: 1800 },
  Max: { effort: 'high', max_tokens: 3600 },
});

function getCipherKey() {
  const hex = process.env.TOKEN_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  return Buffer.from(hex.slice(0, 64), 'hex');
}

function encryptToken(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getCipherKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}.${tag.toString('hex')}.${encrypted.toString('hex')}`;
}

function decryptToken(cipherText) {
  if (!cipherText || !cipherText.includes('.')) return null;
  const [ivHex, tagHex, dataHex] = cipherText.split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getCipherKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

async function fetchModelCatalog({ provider = 'gemini', accessToken }) {
  if (!accessToken) {
    return { provider: null, connected: false, models: [] };
  }

  if (provider === 'openai') {
    return {
      provider: 'openai',
      connected: true,
      models: [
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', tier: 'byok', contextLength: 128000, thinkingLevels: ['Low', 'Mid'] },
        { id: 'gpt-4o', name: 'GPT-4o', tier: 'byok', contextLength: 128000, thinkingLevels: ['Low', 'Mid', 'Max'] },
        { id: 'o3-mini', name: 'o3-mini', tier: 'byok', contextLength: 200000, thinkingLevels: ['Low', 'Mid', 'Max'] },
      ],
    };
  }

  if (provider === 'anthropic') {
    return {
      provider: 'anthropic',
      connected: true,
      models: [
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', tier: 'byok', contextLength: 200000, thinkingLevels: ['Low', 'Mid', 'Max'] },
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', tier: 'byok', contextLength: 200000, thinkingLevels: ['Low', 'Mid'] },
      ],
    };
  }

  // Default: Direct Google Gemini — dynamically query live models available on this key
  const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
    headers: { "x-goog-api-key": accessToken },
  });
  if (resp.ok) {
    const data = await resp.json();
    const models = (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .filter((m) => /gemini/i.test(m.name) && !/embedding|aqa|tts|imagen|veo/i.test(m.name))
      .map((m) => {
        const id = m.name.replace(/^models\//, "");
        return {
          id,
          name: m.displayName || id,
          tier: "byok",
          contextLength: m.inputTokenLimit || 1000000,
          thinkingLevels: ["Low", "Mid", "Max"],
        };
      })
      .sort((a, b) => b.id.localeCompare(a.id));
    if (models.length > 0) {
      return { provider: "gemini", connected: true, models };
    }
  }
  return {
    provider: "gemini",
    connected: true,
    models: [
      { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", tier: "byok", contextLength: 1000000, thinkingLevels: ["Low", "Mid", "Max"] },
    ],
  };
}

async function callNarratorLLM({
  provider = 'gemini',
  accessToken,
  model = 'gemini-2.5-flash',
  thinkingLevel = 'Mid',
  systemPrompt,
  userPrompt,
  imageBase64 = null,
}) {
  if (!accessToken) {
    throw new Error('No AI key connected. Click "Connect AI" and add your personal Gemini, OpenAI, or Anthropic key.');
  }

  const budget = THINKING_BUDGETS[thinkingLevel] || THINKING_BUDGETS.Mid;

  if (provider === 'openai') {
    const userContent = imageBase64
      ? [{ type: 'text', text: userPrompt }, { type: 'image_url', image_url: { url: imageBase64 } }]
      : userPrompt;
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        model,
        max_tokens: budget.max_tokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`OpenAI error (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (provider === 'anthropic') {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': accessToken,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: budget.max_tokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!resp.ok) throw new Error(`Anthropic error (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
    const data = await resp.json();
    return data.content?.map((c) => c.text || '').join('') || '';
  }

  // Default: Direct Google Gemini API (x-goog-api-key header)
  const geminiModel = model.replace(/^google\//, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`;
  const parts = [{ text: userPrompt }];
  if (imageBase64) {
    const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
    if (match) parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
  }
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': accessToken,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { maxOutputTokens: budget.max_tokens },
    }),
  });
  if (!resp.ok) throw new Error(`Gemini error (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
}

module.exports = {
  THINKING_BUDGETS,
  encryptToken,
  decryptToken,
  fetchModelCatalog,
  callNarratorLLM,
};
