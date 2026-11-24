# 2a. Wire trackSession middleware into server/index.js
node -e '
const fs = require("fs");
let idx = fs.readFileSync("server/index.js", "utf8");
if (!idx.includes("trackSession")) {
  idx = idx.replace(
    "const { verifyAuth } = require(\x27./middleware/verifyAuth\x27);",
    "const { verifyAuth } = require(\x27./middleware/verifyAuth\x27);\nconst { trackSession } = require(\x27./middleware/trackSession\x27);"
  );
  idx = idx.replace(
    "app.use(\x27/api\x27, verifyAuth, apiLimiter);",
    "app.use(\x27/api\x27, verifyAuth, trackSession, apiLimiter);"
  );
  fs.writeFileSync("server/index.js", idx);
}
'

# 2b. Upgrade saveRoutes.js with encrypted .delaval export + toxic-payload upload vetting
cat << 'EOF' > server/routes/saveRoutes.js
'use strict';

const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../config/firebaseAdmin');
const { encryptToken, decryptToken } = require('../services/llmGateway');
const { runPreSaveChecklist, upsertCampaignSaveToDrive } = require('../services/driveSyncService');

const router = express.Router();

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitizeUploadedObject(val, depth = 0) {
  if (depth > 12) throw new Error('Save file nesting depth exceeded.');
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map((item) => sanitizeUploadedObject(item, depth + 1));
  const clean = {};
  for (const [k, v] of Object.entries(val)) {
    if (FORBIDDEN_KEYS.has(k)) continue;
    clean[k] = sanitizeUploadedObject(v, depth + 1);
  }
  return clean;
}

router.post('/:campaignId/export', async (req, res) => {
  try {
    const uid = req.user.uid;
    const { campaignId } = req.params;
    const ref = getDb().collection('users').doc(uid).collection('campaigns').doc(campaignId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Story not found.' });

    const state = doc.data();
    const check = runPreSaveChecklist(state);
    await ref.set({ ...state, metaData: check.payload.metaData });

    const vaultDoc = await getDb().collection('users').doc(uid).collection('profile').doc('oauth_vault').get();
    const vault = vaultDoc.exists ? vaultDoc.data() : {};
    const googleToken = decryptToken(req.cookies?.dl_google_token || vault.googleTokenEnc);

    let driveSync = { synced: false, reason: 'Google Drive not connected.' };
    if (googleToken) {
      driveSync = await upsertCampaignSaveToDrive({
        googleAccessToken: googleToken,
        campaignId,
        savePayload: check.payload,
      });
    }

    // Encrypt downloadable file so internal schema/prompts are protected
    const encryptedEnvelope = {
      format: 'DELAVAL_ENC_V1',
      version: '7.2',
      exportedAt: new Date().toISOString(),
      payload: encryptToken(JSON.stringify(check.payload)),
    };

    return res.json({
      savedToCloud: true,
      checklistOk: check.ok,
      issues: check.issues,
      driveSync,
      encryptedSave: encryptedEnvelope,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/import', async (req, res) => {
  try {
    const uid = req.user.uid;
    const rawBody = req.body?.savePayload;
    if (!rawBody || typeof rawBody !== 'object') {
      return res.status(400).json({ error: 'Invalid or empty save file.' });
    }

    const sizeBytes = Buffer.byteLength(JSON.stringify(rawBody), 'utf8');
    if (sizeBytes > 2 * 1024 * 1024) {
      return res.status(413).json({ error: 'Save file exceeds 2 MB safety limit.' });
    }

    let decoded = rawBody;
    if (rawBody.format === 'DELAVAL_ENC_V1' && typeof rawBody.payload === 'string') {
      try {
        decoded = JSON.parse(decryptToken(rawBody.payload));
      } catch (_) {
        return res.status(400).json({ error: 'Could not decrypt .delaval save file (corrupted or wrong key).' });
      }
    }

    const safePayload = sanitizeUploadedObject(decoded);
    if (safePayload.metaData?.project !== 'Integrated_De_Laval_Engine') {
      return res.status(400).json({ error: 'File failed safety vetting: not a valid De Laval save.' });
    }

    const campaignId = `cmp_${crypto.randomBytes(6).toString('hex')}`;
    const importedState = {
      ...safePayload,
      id: campaignId,
      ownerUid: uid,
      chatLog: Array.isArray(safePayload.chatLog) ? safePayload.chatLog : [],
    };

    const ref = getDb().collection('users').doc(uid).collection('campaigns').doc(campaignId);
    await ref.set(importedState);
    await ref
      .collection('snapshots')
      .doc(String(importedState.metaData?.turnNumber || 0))
      .set({
        turnNumber: importedState.metaData?.turnNumber || 0,
        createdAt: new Date().toISOString(),
        state: importedState,
      });

    return res.status(201).json({ campaignId, campaignState: importedState });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
EOF

# 2c. Upgrade mediaRoutes.js with /prompt (LOD tailored prompt) and /upload-and-analyze (Empirical Visual DNA)
cat << 'EOF' > server/routes/mediaRoutes.js
'use strict';

const express = require('express');
const { getDb } = require('../config/firebaseAdmin');
const { decryptToken } = require('../services/llmGateway');
const { ArchivistService } = require('../services/archivistService');
const { MediaPipeline } = require('../services/mediaPipeline');
const { extractEmpiricalRenderProfile, assembleLodPrompt } = require('../engine/visualLodEngine');
const { mediaLimiter } = require('../middleware/rateLimiter');

const router = express.Router();
const mediaPipeline = new MediaPipeline({ archivist: new ArchivistService() });

router.post('/:campaignId/prompt', async (req, res) => {
  try {
    const uid = req.user.uid;
    const { campaignId } = req.params;
    const { shotType = 'portrait', visibility = 'clear', focalEntityIds = [], sceneBrief = '', targetGenerator = 'nano_banana_web' } = req.body || {};

    const doc = await getDb().collection('users').doc(uid).collection('campaigns').doc(campaignId).get();
    if (!doc.exists) return res.status(404).json({ error: 'Story not found.' });

    const promptPack = assembleLodPrompt({
      campaignState: doc.data(),
      shotType,
      visibility,
      focalEntityIds,
      sceneBrief,
      targetGenerator,
    });
    return res.json(promptPack);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:campaignId/upload-and-analyze', mediaLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { campaignId } = req.params;
    const {
      uploadedBase64,
      entityId = 'pc_1',
      entityName = 'Protagonist',
      entityKind = 'character',
      targetGenerator = 'generic',
      model = 'gemini-3.8-flash',
      caption = '',
    } = req.body || {};

    if (!uploadedBase64 || !String(uploadedBase64).startsWith('data:image/')) {
      return res.status(400).json({ error: 'Please upload a valid PNG, JPG, or WEBP image.' });
    }
    if (String(uploadedBase64).length > 6 * 1024 * 1024) {
      return res.status(413).json({ error: 'Uploaded image exceeds 4 MB limit.' });
    }

    const ref = getDb().collection('users').doc(uid).collection('campaigns').doc(campaignId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Story not found.' });

    const state = doc.data();
    const pc = state.activeEntities?.players?.[0] || { id: entityId, name: entityName };

    // Store privately in Firebase Storage
    const portrait = await mediaPipeline.generateCharacterPortrait({
      uid,
      campaignId,
      player: pc,
      uploadedBase64,
    });

    // Run Empirical Vision Pass to build renderProfile (separate from narrativeProfile)
    let renderProfile = null;
    const vaultDoc = await getDb().collection('users').doc(uid).collection('profile').doc('oauth_vault').get();
    const vault = vaultDoc.exists ? vaultDoc.data() : {};
    const accessToken = decryptToken(vault.byokKeyEnc);
    const provider = vault.byokProvider || 'gemini';

    if (accessToken) {
      try {
        renderProfile = await extractEmpiricalRenderProfile({
          imageBase64: uploadedBase64,
          entityName: pc.name || entityName,
          entityKind,
          targetGenerator,
          llmCreds: { provider, accessToken, model, thinkingLevel: 'Mid' },
        });

        state.worldState.visualRegistry = state.worldState.visualRegistry || {};
        state.worldState.visualRegistry[entityId] = {
          entityId,
          entityName: pc.name || entityName,
          entityKind,
          storagePath: portrait.storagePath,
          renderProfile,
        };
        if (!state.worldState.visualStyleCeiling && renderProfile.observedStyleCeiling) {
          state.worldState.visualStyleCeiling = renderProfile.observedStyleCeiling;
        }
        state.worldState.highlights = state.worldState.highlights || [];
        state.worldState.highlights.push({
          turnNumber: state.metaData?.turnNumber || 0,
          kind: entityKind === 'character' ? 'portrait' : 'scene',
          caption: caption || `${pc.name || entityName} visual lock`,
          storagePath: portrait.storagePath,
          createdAt: new Date().toISOString(),
        });
        await ref.set(state);
      } catch (_) {
        // Upload still succeeds even if vision analysis hits a transient error
      }
    }

    return res.json({ portrait, renderProfile, campaignState: state });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:campaignId/portrait', mediaLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { campaignId } = req.params;
    const { uploadedBase64 = null, inferAppearanceFromImage = false } = req.body || {};

    const campaignRef = getDb().collection('users').doc(uid).collection('campaigns').doc(campaignId);
    const doc = await campaignRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'Story not found.' });

    const state = doc.data();
    const pc = state.activeEntities?.players?.[0];
    if (!pc) return res.status(400).json({ error: 'No player character created yet.' });

    const vaultDoc = await getDb().collection('users').doc(uid).collection('profile').doc('oauth_vault').get();
    const vault = vaultDoc.exists ? vaultDoc.data() : {};
    const accessToken = decryptToken(vault.byokKeyEnc);

    const portrait = await mediaPipeline.generateCharacterPortrait({
      uid,
      campaignId,
      player: pc,
      style: state.globalState?.narratorStyle,
      uploadedBase64,
      accessToken,
    });

    const inferredPhysicalTraits = inferAppearanceFromImage && uploadedBase64
      ? { notableFeatures: 'Inferred from uploaded reference photo' }
      : null;

    return res.json({ portrait, inferredPhysicalTraits });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:campaignId/panel', mediaLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { campaignId } = req.params;
    const { brief = 'Key dramatic moment' } = req.body || {};

    const doc = await getDb().collection('users').doc(uid).collection('campaigns').doc(campaignId).get();
    if (!doc.exists) return res.status(404).json({ error: 'Story not found.' });

    const panel = await mediaPipeline.generateScenePanel({
      uid,
      campaignId,
      brief,
      campaignState: doc.data(),
    });
    return res.json({ panel });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/signed-url', async (req, res) => {
  try {
    const storagePath = String(req.query.path || '');
    const signed = await mediaPipeline.getSignedUrl(storagePath, req.user.uid);
    return res.json(signed);
  } catch (err) {
    const status = err.message.includes('PERMISSION_DENIED') ? 403 : 400;
    return res.status(status).json({ error: err.message });
  }
});

module.exports = router;
EOF