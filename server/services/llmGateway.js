'use strict';

const crypto = require('crypto');

const THINKING_BUDGETS = Object.freeze({
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
 * Strips any leaked chain-of-thought blocks (XML <thought> tags or Gemma
 * scratchpad preambles like "* Player Input: ... * Word count: ~150 words.")
 * so only clean, player-facing prose reaches the chat bubble.
 */
function stripThoughtLeaks(rawText) {
  let text = String(rawText || '');
  let extractedThought = '';

  const xmlMatch = text.match(/<thought>([\s\S]*?)<\/thought>/i);
  if (xmlMatch) {
    extractedThought = xmlMatch[1].trim();
    text = text.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
  }

  // Catch Gemma scratchpad leaks ending with "Word count: ... Perfect." or "* Refining Text:"
  const wordCountLeak = text.match(/^([\s\S]*?\*\s*Word count:[^\n]*?(?:Perfect\.|Good\.|Done\.|words\.))\s*([\s\S]+)$/i);
  if (wordCountLeak) {
    extractedThought = (extractedThought ? `${extractedThought}\n` : '') + wordCountLeak[1].trim();
    text = wordCountLeak[2].trim();
  } else if (/^\*\s*(?:Player Input|Thinking Process|Core Elements|Analyze the Request):/i.test(text)) {
    const splitIdx = text.lastIndexOf('\n\n');
    if (splitIdx > 0 && splitIdx < text.length - 40) {
      extractedThought = (extractedThought ? `${extractedThought}\n` : '') + text.slice(0, splitIdx).trim();
      text = text.slice(splitIdx).trim();
    }
  }

  return { text: text.trim(), extractedThought: extractedThought.trim() };
}

async function fetchWithRetry(url, options, maxRetries = 2) {
  let resp;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    resp = await fetch(url, options);
    if (resp.status !== 503 && resp.status !== 502) return resp;
    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  return resp;
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
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', tier: 'byok', contextLength: 128000, thinkingLevels: ['Mid', 'Max'] },
        { id: 'gpt-4o', name: 'GPT-4o', tier: 'byok', contextLength: 128000, thinkingLevels: ['Mid', 'Max'] },
        { id: 'o3-mini', name: 'o3-mini', tier: 'byok', contextLength: 200000, thinkingLevels: ['Mid', 'Max'] },
      ],
    };
  }

  if (provider === 'anthropic') {
    return {
      provider: 'anthropic',
      connected: true,
      models: [
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', tier: 'byok', contextLength: 200000, thinkingLevels: ['Mid', 'Max'] },
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', tier: 'byok', contextLength: 200000, thinkingLevels: ['Mid', 'Max'] },
      ],
    };
  }

  const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
    headers: { 'x-goog-api-key': accessToken },
  });
  if (resp.ok) {
    const data = await resp.json();
    const models = (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .filter((m) => /gemini|gemma/i.test(m.name) && !/embedding|aqa|tts|imagen|veo|image|banana|robotics|omni/i.test(m.name))
      .map((m) => {
        const id = m.name.replace(/^models\//, '');
        return {
          id,
          name: m.displayName || id,
          tier: /gemma/i.test(id) ? 'free' : 'byok',
          contextLength: m.inputTokenLimit || 1000000,
          thinkingLevels: ['Mid', 'Max'],
        };
      })
      .sort((a, b) => {
        const score = (id) => (id === 'gemini-3.8-flash' ? 3 : /3\.8.*flash/i.test(id) ? 2 : /gemma-4/i.test(id) ? 1.5 : /flash/i.test(id) ? 1 : 0);
        return score(b.id) - score(a.id) || b.id.localeCompare(a.id);
      });
    if (models.length > 0) {
      return { provider: 'gemini', connected: true, models };
    }
  }

  return {
    provider: 'gemini',
    connected: true,
    models: [
      { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', tier: 'byok', contextLength: 1000000, thinkingLevels: ['Mid', 'Max'] },
    ],
  };
}

async function callNarratorLLMWithThinking({
  provider = 'gemini',
  accessToken,
  model = 'gemini-3.8-flash',
  thinkingLevel = 'Mid',
  systemPrompt,
  userPrompt,
  imageBase64 = null,
}) {
  if (!accessToken) {
    throw new Error('No AI key connected. Click "Connect AI" in the top bar first.');
  }

  const budget = THINKING_BUDGETS[thinkingLevel] || THINKING_BUDGETS.Mid;

  if (provider === 'openai') {
    const userContent = imageBase64
      ? [{ type: 'text', text: userPrompt }, { type: 'image_url', image_url: { url: imageBase64 } }]
      : userPrompt;
    const resp = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
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
    const cleaned = stripThoughtLeaks(data.choices?.[0]?.message?.content || '');
    return { text: cleaned.text, thinking: cleaned.extractedThought };
  }

  if (provider === 'anthropic') {
    const resp = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
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
    const raw = data.content?.map((c) => c.text || '').join('') || '';
    const cleaned = stripThoughtLeaks(raw);
    return { text: cleaned.text, thinking: cleaned.extractedThought };
  }

  const geminiModel = model.replace(/^google\//, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`;
  const isGemma3 = /^gemma-3/i.test(geminiModel);
  const parts = [{ text: isGemma3 ? `${systemPrompt}\n\n${userPrompt}` : userPrompt }];
  if (imageBase64) {
    const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
    if (match) parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
  }
  const resp = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': accessToken,
    },
    body: JSON.stringify({
      ...(isGemma3 ? {} : { system_instruction: { parts: [{ text: systemPrompt }] } }),
      contents: [{ role: 'user', parts }],
      generationConfig: { maxOutputTokens: budget.max_tokens },
    }),
  });
  if (!resp.ok) throw new Error(`Gemini error (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
  const data = await resp.json();
  const responseParts = data.candidates?.[0]?.content?.parts || [];
  const apiThoughts = responseParts.filter((p) => p.thought).map((p) => p.text || '').join('\n').trim();
  const visibleRaw = responseParts.filter((p) => !p.thought).map((p) => p.text || '').join('');
  const cleaned = stripThoughtLeaks(visibleRaw);
  const combinedThinking = [apiThoughts, cleaned.extractedThought].filter(Boolean).join('\n');
  return { text: cleaned.text, thinking: combinedThinking };
}

async function callNarratorLLM(params) {
  const res = await callNarratorLLMWithThinking(params);
  return res.text;
}

module.exports = {
  THINKING_BUDGETS,
  encryptToken,
  decryptToken,
  stripThoughtLeaks,
  fetchModelCatalog,
  callNarratorLLM,
  callNarratorLLMWithThinking,
};
