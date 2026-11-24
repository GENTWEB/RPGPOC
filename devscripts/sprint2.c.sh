cat << 'EOF' > server/middleware/trackSession.js
'use strict';

const crypto = require('crypto');
const { getDb } = require('../config/firebaseAdmin');

const THROTTLE_MS = 5 * 60 * 1000;
const recentWrites = new Map();

function hashIp(rawIp) {
  const secret = process.env.TOKEN_ENCRYPTION_KEY || 'delaval-default-salt';
  return crypto.createHmac('sha256', secret).update(String(rawIp || 'unknown')).digest('hex').slice(0, 16);
}

/**
 * Passive Device & Hashed-IP Session Tracker:
 * Logs anonymized deviceId + HMAC-hashed IP to /users/{uid}/sessions/{deviceId}
 * (throttled to once every 5 minutes per device to keep Firestore writes low).
 */
function trackSession(req, res, next) {
  try {
    const uid = req.user?.uid;
    if (!uid) return next();

    const deviceId = String(req.headers['x-device-id'] || 'web-unknown').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    const cacheKey = `${uid}:${deviceId}`;
    const now = Date.now();
    const lastWrite = recentWrites.get(cacheKey) || 0;

    if (now - lastWrite >= THROTTLE_MS) {
      recentWrites.set(cacheKey, now);
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
      const userAgent = String(req.headers['user-agent'] || '').slice(0, 160);
      const iso = new Date(now).toISOString();

      getDb()
        .collection('users')
        .doc(uid)
        .collection('sessions')
        .doc(deviceId)
        .set(
          {
            deviceId,
            ipHash: hashIp(ip),
            userAgent,
            lastSeenAt: iso,
            active: true,
          },
          { merge: true }
        )
        .catch(() => {});
    }
  } catch (_) {
    // Non-blocking telemetry
  }
  return next();
}

module.exports = { trackSession, hashIp };
EOF

cat << 'EOF' > server/engine/visualLodEngine.js
'use strict';

const { callNarratorLLM } = require('../services/llmGateway');

const GENERATOR_SPECS = Object.freeze({
  nano_banana_web: {
    label: 'Gemini / Nano Banana (Web)',
    maxWords: 75,
    supportsNegative: false,
    format: (body, style, shot) => `${shot === 'portrait' ? 'Full-body character portrait.' : 'Cinematic scene.'} ${body}. Style: ${style}.`,
  },
  dalle_chatgpt: {
    label: 'ChatGPT / DALL-E',
    maxWords: 80,
    supportsNegative: false,
    format: (body, style, shot) => `${shot === 'portrait' ? 'Head-to-toe character portrait' : 'Atmospheric illustration'}: ${body}. Visual style: ${style}. No text overlays.`,
  },
  midjourney: {
    label: 'Midjourney',
    maxWords: 55,
    supportsNegative: false,
    format: (body, style, shot) => `${body}, ${style} --ar ${shot === 'portrait' ? '2:3' : '16:9'} --v 6.1 --no text, watermark, blurry`,
  },
  stable_diffusion: {
    label: 'Stable Diffusion / Flux',
    maxWords: 55,
    supportsNegative: true,
    format: (body, style) => `(${style}:1.15), ${body}, cohesive lighting, crisp composition`,
    negative: 'text, watermark, signature, extra limbs, mutated hands, lowres, concept bleed',
  },
  generic: {
    label: 'Other / Custom Generator',
    maxWords: 60,
    supportsNegative: false,
    format: (body, style) => `${body}. Art style: ${style}.`,
  },
});

function trimToWordBudget(text, maxWords) {
  const words = String(text || '').trim().split(/\s+/);
  if (words.length <= maxWords) return words.join(' ');
  return words.slice(0, maxWords).join(' ');
}

/**
 * Image-First Empirical Vision Analyzer:
 * Analyzes an image the user actually generated and uploaded, building a
 * renderProfile (L1/L2/L3 + observedStyleCeiling) calibrated strictly to
 * what their image generator is capable of drawing—without corrupting narrativeProfile.
 */
async function extractEmpiricalRenderProfile({
  imageBase64,
  entityName,
  entityKind = 'character',
  targetGenerator = 'generic',
  llmCreds,
}) {
  const systemPrompt = `You analyze a user-uploaded RPG image to build an empirical renderProfile strictly calibrated to what THIS image generator actually produced.
Do NOT invent photorealistic details that are not in the image—if the image is stick figures, paper-craft, pixel art, or simple ink, describe that exact style honestly so future prompts stay consistent with this generator's real capabilities.
Return ONLY valid JSON (no markdown fences):
{
  "observedStyleCeiling": "5-12 word description of the actual art medium, line quality, and color style visible in this image",
  "L1": "6-10 word silhouette / distant view anchor (only major shape & primary color)",
  "L2": "12-20 word medium-shot anchor (key outfit, face/form, primary distinguishing features)",
  "L3": "20-30 word close-up anchor (fine visual details actually visible in this image)"
}`;

  const userPrompt = `ENTITY NAME: ${entityName}
ENTITY KIND: ${entityKind}
TARGET GENERATOR: ${targetGenerator}
Analyze the attached image and output the JSON renderProfile.`;

  const raw = await callNarratorLLM({
    ...llmCreds,
    systemPrompt,
    userPrompt,
    imageBase64,
  });

  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  return {
    observedStyleCeiling: parsed.observedStyleCeiling || 'stylized illustration',
    lod: {
      L1: parsed.L1 || entityName,
      L2: parsed.L2 || entityName,
      L3: parsed.L3 || entityName,
    },
    calibratedAt: new Date().toISOString(),
  };
}

/**
 * Assembles a reciprocity-safe, token-budgeted image prompt from empirical
 * renderProfiles (selecting L1, L2, or L3 based on shot distance & visibility).
 */
function assembleLodPrompt({
  campaignState,
  shotType = 'medium',
  visibility = 'clear',
  focalEntityIds = [],
  sceneBrief = '',
  targetGenerator = 'nano_banana_web',
}) {
  const spec = GENERATOR_SPECS[targetGenerator] || GENERATOR_SPECS.generic;
  const registry = campaignState?.worldState?.visualRegistry || {};
  const styleCeiling =
    campaignState?.worldState?.visualStyleCeiling ||
    campaignState?.globalState?.narratorStyle ||
    'Atmospheric graphic novel illustration';

  const pickTier = (isFocal) => {
    if (visibility === 'obscured') return 'L1';
    if (shotType === 'closeup' || shotType === 'portrait') return isFocal ? 'L3' : 'L1';
    if (shotType === 'wide') return isFocal ? 'L2' : 'L1';
    return isFocal ? 'L2' : 'L1';
  };

  const fragments = [];
  for (const id of focalEntityIds) {
    const entry = registry[id];
    if (entry?.renderProfile?.lod) {
      const tier = pickTier(true);
      fragments.push(entry.renderProfile.lod[tier] || entry.renderProfile.lod.L2);
    }
  }

  if (sceneBrief) fragments.push(sceneBrief);

  if (fragments.length === 0) {
    const pc = campaignState?.activeEntities?.players?.[0];
    const traits = pc?.physicalTraits || {};
    fragments.push(
      `${pc?.name || 'Protagonist'}, ${traits.notableFeatures && traits.notableFeatures !== 'Undeclared' ? traits.notableFeatures : 'distinctive traveler'} in ${campaignState?.globalState?.settingDescription || 'a mysterious world'}`
    );
  }

  const trimmedBody = trimToWordBudget(fragments.join('; '), spec.maxWords);
  const prompt = spec.format(trimmedBody, styleCeiling, shotType);

  return {
    targetGenerator,
    generatorLabel: spec.label,
    shotType,
    prompt,
    negativePrompt: spec.supportsNegative ? spec.negative : null,
    styleCeiling,
  };
}

module.exports = {
  GENERATOR_SPECS,
  extractEmpiricalRenderProfile,
  assembleLodPrompt,
};
EOF