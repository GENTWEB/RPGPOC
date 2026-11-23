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

/**
 * Fetches available models dynamically for the authenticated OpenRouter or Google OAuth token,
 * tagging free-tier vs paid-tier models and permitted reasoning/thinking tiers.
 */
async function fetchModelCatalog({ provider = 'openrouter', accessToken }) {
  if (!accessToken) {
    return {
      provider,
      connected: false,
      models: [],
    };
  }

  if (provider === 'openrouter') {
    const base = process.env.OPENROUTER_API_BASE || 'https://openrouter.ai/api/v1';
    const resp = await fetch(`${base}/models`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'HTTP-Referer': process.env.OPENROUTER_APP_URL || 'http://localhost:5173',
        'X-Title': process.env.OPENROUTER_APP_NAME || 'De Laval Narrative RPG Engine v7.2',
      },
    });
    if (!resp.ok) {
      throw new Error(`OpenRouter model catalog request failed (${resp.status})`);
    }
    const json = await resp.json();
    const models = (json.data || []).slice(0, 60).map((m) => {
      const promptPrice = Number(m.pricing?.prompt || 0);
      const isFree = promptPrice === 0;
      const supportsReasoning = /thinking|reason|o1|o3|r1|claude-3\.7|claude-4|gemini-2\.5|pro/i.test(m.id);
      return {
        id: m.id,
        name: m.name || m.id,
        tier: isFree ? 'free' : 'paid',
        contextLength: m.context_length || 32000,
        thinkingLevels: supportsReasoning ? ['Low', 'Mid', 'Max'] : ['Low', 'Mid'],
      };
    });
    return { provider, connected: true, models };
  }

  // Direct Google OAuth Gemini fallback catalog
  return {
    provider: 'google',
    connected: true,
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', tier: 'free', contextLength: 1000000, thinkingLevels: ['Low', 'Mid', 'Max'] },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', tier: 'paid', contextLength: 1000000, thinkingLevels: ['Low', 'Mid', 'Max'] },
    ],
  };
}

/**
 * Invokes the selected LLM provider (OpenRouter OAuth PKCE or Google OAuth Gemini)
 * without ever asking users for raw API keys.
 */
async function callNarratorLLM({
  provider = 'openrouter',
  accessToken,
  model = 'google/gemini-2.5-flash',
  thinkingLevel = 'Mid',
  systemPrompt,
  userPrompt,
  imageBase64 = null,
}) {
  if (!accessToken) {
    throw new Error('No AI provider OAuth session connected. Click "Connect AI Provider" first.');
  }

  const budget = THINKING_BUDGETS[thinkingLevel] || THINKING_BUDGETS.Mid;
  const userContent = imageBase64
    ? [
        { type: 'text', text: userPrompt },
        { type: 'image_url', image_url: { url: imageBase64 } },
      ]
    : userPrompt;

  if (provider === 'openrouter') {
    const base = process.env.OPENROUTER_API_BASE || 'https://openrouter.ai/api/v1';
    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'HTTP-Referer': process.env.OPENROUTER_APP_URL || 'http://localhost:5173',
        'X-Title': process.env.OPENROUTER_APP_NAME || 'De Laval Narrative RPG Engine v7.2',
      },
      body: JSON.stringify({
        model,
        max_tokens: budget.max_tokens,
        reasoning: { effort: budget.effort },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`OpenRouter completion error (${resp.status}): ${errBody.slice(0, 200)}`);
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
  }

  // Direct Google OAuth Gemini Generative Language API
  const geminiModel = model.replace(/^google\//, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`;
  const parts = [{ text: userPrompt }];
  if (imageBase64) {
    const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
    }
  }
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { maxOutputTokens: budget.max_tokens },
    }),
  });
  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Gemini completion error (${resp.status}): ${errBody.slice(0, 200)}`);
  }
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
