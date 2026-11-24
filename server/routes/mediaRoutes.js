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
