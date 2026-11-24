'use strict';

const crypto = require('crypto');

const THINKING_BUDGETS = Object.freeze({
  Mid: { effort: 'medium', max_tokens: 1400, thinkingBudget: 512 },
  Max: { effort: 'high', max_tokens: 2600, thinkingBudget: 1536 },
});

function describeModel(id, displayName) {
  const lower = String(id || '').toLowerCase();
  if (lower.includes('gemma-4-26b')) {
    return {
      tierGroup: 'free',
      costLabel: 'FREE',
      description: 'Lightweight, fun, faster than walking, sometimes makes mistakes',
      speedIcon: '🛹',
      speedScore: 6,
      sortRank: 110,
    };
  }
  if (lower.includes('gemma-4-31b')) {
    return {
      tierGroup: 'free',
      costLabel: 'FREE',
      description: 'Lightweight, fun, efficient, more stable storytelling',
      speedIcon: '🚲',
      speedScore: 7,
      sortRank: 95,
    };
  }
  if (lower.includes('gemma')) {
    return {
      tierGroup: 'free',
      costLabel: 'FREE',
      description: 'Open-weights free model hosted on Google AI Studio',
      speedIcon: '🛹',
      speedScore: 6,
      sortRank: 80,
    };
  }
  if (lower.includes('3.8-flash')) {
    return {
      tierGroup: 'free',
      costLabel: 'FREE (TRIAL)',
      description: 'Recommended — sharp pacing, occasional peak-hour traffic',
      speedIcon: '🚗',
      speedScore: 8,
      sortRank: 100,
    };
  }
  if (lower.includes('flash-lite')) {
    return {
      tierGroup: 'free',
      costLabel: 'FREE',
      description: 'Ultra-fast responses, lighter prose depth',
      speedIcon: '🏎️',
      speedScore: 9,
      sortRank: 85,
    };
  }
  if (lower.includes('flash')) {
    return {
      tierGroup: 'free',
      costLabel: 'FREE (TRIAL)',
      description: 'Fast all-rounder for responsive turn-by-turn play',
      speedIcon: '🚗',
      speedScore: 8,
      sortRank: 88,
    };
  }
  if (lower.includes('neon') || lower.includes('pro') || lower.includes('hydrogen')) {
    return {
      tierGroup: 'paid',
      costLabel: 'PAID',
      description: 'Heavyweight reasoning & rich literary prose (requires API billing)',
      speedIcon: '✈️',
      speedScore: 7,
      sortRank: 70,
    };
  }
  return {
    tierGroup: 'paid',
    costLabel: 'PAID',
    description: displayName || 'General-purpose Game Master model',
    speedIcon: '🚗',
    speedScore: 7,
    sortRank: 50,
  };
}

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

function stripThoughtLeaks(rawText) {
  let text = String(rawText || '');
  let extractedThought = '';

  const xmlMatch = text.match(/<thought>([\s\S]*?)<\/thought>/i);
  if (xmlMatch) {
    extractedThought = xmlMatch[1].trim();
    text = text.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
  }

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

async function fetchWithTimeoutAndRetry(url, options, maxRetries = 1) {
  let resp;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180000);
    try {
      resp = await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (resp.status !== 503 && resp.status !== 502) return resp;
    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, 1200));
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
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', role: 'GM', tierGroup: 'paid', costLabel: 'LOW COST', description: 'Snappy, reliable, low token cost', speedIcon: '🏎️', speedScore: 9, thinkingLevels: ['Mid', 'Max'] },
        { id: 'gpt-4o', name: 'GPT-4o', role: 'GM', tierGroup: 'paid', costLabel: 'PAID', description: 'Rich character voice & nuanced dialogue', speedIcon: '🚗', speedScore: 8, thinkingLevels: ['Mid', 'Max'] },
        { id: 'o3-mini', name: 'o3-mini', role: 'GM', tierGroup: 'paid', costLabel: 'PAID', description: 'Deep tactical & puzzle reasoning', speedIcon: '🚲', speedScore: 6, thinkingLevels: ['Mid', 'Max'] },
      ],
    };
  }

  if (provider === 'anthropic') {
    return {
      provider: 'anthropic',
      connected: true,
      models: [
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', role: 'GM', tierGroup: 'paid', costLabel: 'PAID', description: 'Standout literary prose & character depth', speedIcon: '🚗', speedScore: 8, thinkingLevels: ['Mid', 'Max'] },
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', role: 'GM', tierGroup: 'paid', costLabel: 'LOW COST', description: 'Quick, punchy narrative replies', speedIcon: '🏎️', speedScore: 9, thinkingLevels: ['Mid', 'Max'] },
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
      .filter((m) => /gemini|gemma/i.test(m.name) && !/embedding|aqa|tts|imagen|veo|image|banana|robotics|omni|exp|001/i.test(m.name))
      .map((m) => {
        const id = m.name.replace(/^models\//, '');
        const meta = describeModel(id, m.displayName);
        return {
          id,
          name: m.displayName || id,
          role: 'GM',
          tier: meta.costLabel,
          ...meta,
          contextLength: m.inputTokenLimit || 1000000,
          thinkingLevels: ['Mid', 'Max'],
        };
      })
      .sort((a, b) => b.sortRank - a.sortRank || b.id.localeCompare(a.id));
    if (models.length > 0) {
      return { provider: 'gemini', connected: true, models };
    }
  }

  return {
    provider: 'gemini',
    connected: true,
    models: [
      { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', role: 'GM', ...describeModel('gemini-3.8-flash'), thinkingLevels: ['Mid', 'Max'] },
    ],
  };
}

async function callNarratorLLMWithThinking({
  provider = 'gemini',
  accessToken,
  model = 'gemma-4-26b-a4b-it',
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
    const resp = await fetchWithTimeoutAndRetry('https://api.openai.com/v1/chat/completions', {
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
    const resp = await fetchWithTimeoutAndRetry('https://api.anthropic.com/v1/messages', {
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
  const resp = await fetchWithTimeoutAndRetry(url, {
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
