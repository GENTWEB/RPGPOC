'use strict';

const crypto = require('crypto');
const { SIGNED_URL_TTL_MS } = require('../config/constants');
const { getBucket } = require('../config/firebaseAdmin');

/**
 * Private Media Vault & Visual Pipeline:
 * - Stores character portraits and critical-moment graphic-novel panels under
 *   private Firebase Storage paths: users/{uid}/campaigns/{campaignId}/...
 * - Issues strictly short-lived (15-minute TTL) Express Admin SDK signed URLs.
 * - Supports fire-and-forget async NPC portrait generation upon Tier II unlock.
 */
class MediaPipeline {
  constructor({ archivist = null, imageGenerator = null } = {}) {
    this.archivist = archivist;
    this.imageGenerator = imageGenerator;
    this._memoryVault = new Map();
  }

  async _storePrivatePng(storagePath, buffer) {
    const bucket = getBucket();
    if (bucket) {
      const file = bucket.file(storagePath);
      await file.save(buffer, {
        contentType: 'image/png',
        resumable: false,
        metadata: { cacheControl: 'private, max-age=0' },
      });
      return storagePath;
    }
    this._memoryVault.set(storagePath, buffer.toString('base64'));
    return storagePath;
  }

  async getSignedUrl(storagePath, uid) {
    if (!storagePath || !storagePath.startsWith(`users/${uid}/`)) {
      throw new Error('PERMISSION_DENIED: Storage path does not belong to authenticated user.');
    }

    const bucket = getBucket();
    if (bucket) {
      const [url] = await bucket.file(storagePath).getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + SIGNED_URL_TTL_MS,
      });
      return { url, expiresInSeconds: SIGNED_URL_TTL_MS / 1000, storagePath };
    }

    const b64 = this._memoryVault.get(storagePath);
    const dataUrl = b64 ? `data:image/png;base64,${b64}` : `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="100%" height="100%" fill="#161d26"/><text x="50%" y="50%" fill="#f59e0b" font-family="monospace" font-size="18" text-anchor="middle">DE LAVAL PRIVATE PANEL</text></svg>')}`;
    return {
      url: dataUrl,
      expiresInSeconds: SIGNED_URL_TTL_MS / 1000,
      storagePath,
    };
  }

  async _renderImageBuffer({ prompt, referencePaths = [], accessToken = null }) {
    if (typeof this.imageGenerator === 'function') {
      return this.imageGenerator({ prompt, referencePaths });
    }

    if (accessToken && process.env.IMAGE_GEN_API_URL) {
      try {
        const resp = await fetch(process.env.IMAGE_GEN_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            model: process.env.IMAGE_GEN_MODEL || 'google/gemini-2.5-flash-image-preview',
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const b64 = data?.data?.[0]?.b64_json;
          if (b64) return Buffer.from(b64, 'base64');
        }
      } catch (_) {
        // Fallback to clean 1x1 PNG placeholder buffer if remote image API is unreachable
      }
    }

    // Minimal valid 1x1 dark PNG buffer for offline/deterministic simulation
    return Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
  }

  async generateCharacterPortrait({ uid, campaignId, player, style = 'Graphic Novel Noir', uploadedBase64 = null, accessToken = null }) {
    const portraitId = `pc_${player.id || '1'}_${crypto.randomBytes(4).toString('hex')}`;
    const storagePath = `users/${uid}/campaigns/${campaignId}/portraits/${portraitId}.png`;

    let buffer;
    if (uploadedBase64) {
      const cleaned = uploadedBase64.replace(/^data:image\/\w+;base64,/, '');
      buffer = Buffer.from(cleaned, 'base64');
    } else {
      const traits = player.physicalTraits || {};
      const prompt = `Full-body head-to-toe character portrait in ${style} style: ${player.name}, ${traits.race || ''} ${traits.build || ''}, hair: ${traits.hair || 'unspecified'}, notable features: ${traits.notableFeatures || 'none'}. Clean dark studio backdrop, crisp ink lines.`;
      buffer = await this._renderImageBuffer({ prompt, accessToken });
    }

    await this._storePrivatePng(storagePath, buffer);
    if (this.archivist) {
      await this.archivist.recordVisualAsset(uid, campaignId, portraitId, {
        kind: 'pc_portrait',
        storagePath,
        entityId: player.id,
      });
    }

    const signed = await this.getSignedUrl(storagePath, uid);
    return {
      portraitId,
      storagePath,
      signedUrl: signed.url,
      expiresInSeconds: signed.expiresInSeconds,
    };
  }

  async generateNpcPortraitAsync({ uid, campaignId, npc, style = 'Graphic Novel Noir', accessToken = null, onComplete = null }) {
    const portraitId = `npc_${npc.id}_${crypto.randomBytes(4).toString('hex')}`;
    const storagePath = `users/${uid}/campaigns/${campaignId}/portraits/${portraitId}.png`;
    const prompt = `Character portrait in ${style} style for NPC ${npc.name || npc.id}. Backstory cue: ${npc.genetics?.tier_2_relational?.backstory || 'mysterious ally'}.`;

    const buffer = await this._renderImageBuffer({ prompt, accessToken });
    await this._storePrivatePng(storagePath, buffer);
    if (this.archivist) {
      await this.archivist.recordVisualAsset(uid, campaignId, portraitId, {
        kind: 'npc_portrait',
        storagePath,
        entityId: npc.id,
      });
    }
    const signed = await this.getSignedUrl(storagePath, uid);
    const result = { portraitId, storagePath, signedUrl: signed.url };
    if (typeof onComplete === 'function') {
      await onComplete(result);
    }
    return result;
  }

  async generateScenePanel({ uid, campaignId, brief, campaignState, accessToken = null }) {
    const panelId = `panel_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const storagePath = `users/${uid}/campaigns/${campaignId}/panels/${panelId}.png`;

    const referencePaths = [];
    for (const pc of campaignState?.activeEntities?.players || []) {
      if (pc.approvedPortraitRef) referencePaths.push(pc.approvedPortraitRef);
    }
    for (const npc of campaignState?.activeEntities?.activeNPCs || []) {
      if (npc.currentTier <= 2 && npc.portraitRef) referencePaths.push(npc.portraitRef);
    }

    const style = campaignState?.globalState?.narratorStyle || 'Cinematic Graphic Novel';
    const prompt = `Graphic novel panel in ${style} style. Consistent likeness from ${referencePaths.length} character reference(s). Scene brief: ${brief}`;

    const buffer = await this._renderImageBuffer({ prompt, referencePaths, accessToken });
    await this._storePrivatePng(storagePath, buffer);
    if (this.archivist) {
      await this.archivist.recordVisualAsset(uid, campaignId, panelId, {
        kind: 'scene_panel',
        storagePath,
        brief,
        referencePaths,
      });
    }

    const signed = await this.getSignedUrl(storagePath, uid);
    return {
      panelId,
      storagePath,
      brief,
      signedUrl: signed.url,
      expiresInSeconds: signed.expiresInSeconds,
    };
  }
}

module.exports = { MediaPipeline };
