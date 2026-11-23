'use strict';

const express = require('express');
const { getDb } = require('../config/firebaseAdmin');
const { decryptToken } = require('../services/llmGateway');
const { ArchivistService } = require('../services/archivistService');
const { MediaPipeline } = require('../services/mediaPipeline');
const { mediaLimiter } = require('../middleware/rateLimiter');

const router = express.Router();
const mediaPipeline = new MediaPipeline({ archivist: new ArchivistService() });

router.post('/:campaignId/portrait', mediaLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { campaignId } = req.params;
    const { uploadedBase64 = null, inferAppearanceFromImage = false } = req.body || {};

    const campaignRef = getDb().collection('users').doc(uid).collection('campaigns').doc(campaignId);
    const doc = await campaignRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'Campaign not found.' });

    const state = doc.data();
    const pc = state.activeEntities?.players?.[0];
    if (!pc) return res.status(400).json({ error: 'No player character created yet.' });

    const vaultDoc = await getDb().collection('users').doc(uid).collection('profile').doc('oauth_vault').get();
    const vault = vaultDoc.exists ? vaultDoc.data() : {};
    const accessToken = decryptToken(req.cookies?.dl_or_token || vault.openrouterTokenEnc);

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
    if (!doc.exists) return res.status(404).json({ error: 'Campaign not found.' });

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
