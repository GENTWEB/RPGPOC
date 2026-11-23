'use strict';

const { ARCHIVIST_SILOS } = require('../config/constants');
const { getDb } = require('../config/firebaseAdmin');

/**
 * Memory Archivist Service:
 * Manages the 4 Cold Storage Silos:
 *   1. HISTORICAL_MEMORY (Rule-of-4 evicted scenes with significantDialogue & characterStateChanges)
 *   2. NPC_GENETICS_ARCHIVE (Tier I Permanence >= 100 XP NPCs)
 *   3. WORLD_LORE_CODEX (factions, locations, subplots)
 *   4. VISUAL_ASSET_LEDGER (private storage refs for portraits & graphic-novel panels)
 * Supports Firestore (default) or MongoDB Atlas via ARCHIVIST_DRIVER=firestore|mongo.
 */
class ArchivistService {
  constructor({ driver = process.env.ARCHIVIST_DRIVER || 'firestore', db = null } = {}) {
    this.driver = driver;
    this.db = db;
    this._mongoClient = null;
  }

  _getFirestore() {
    return this.db || getDb();
  }

  async _getMongoCollection(collectionName) {
    if (!this._mongoClient) {
      const { MongoClient } = require('mongodb');
      this._mongoClient = new MongoClient(process.env.MONGODB_URI);
      await this._mongoClient.connect();
    }
    return this._mongoClient.db().collection(collectionName);
  }

  async writeRecord(uid, campaignId, siloName, docId, payload) {
    const record = {
      ...payload,
      uid,
      campaignId,
      archivedAt: new Date().toISOString(),
    };

    if (this.driver === 'mongo' && process.env.MONGODB_URI) {
      const col = await this._getMongoCollection(siloName);
      await col.updateOne(
        { uid, campaignId, _recordId: docId },
        { $set: { ...record, _recordId: docId } },
        { upsert: true }
      );
      return record;
    }

    const db = this._getFirestore();
    await db
      .collection('users')
      .doc(uid)
      .collection('campaigns')
      .doc(campaignId)
      .collection(siloName)
      .doc(docId)
      .set(record, { merge: true });

    return record;
  }

  async listRecords(uid, campaignId, siloName) {
    if (this.driver === 'mongo' && process.env.MONGODB_URI) {
      const col = await this._getMongoCollection(siloName);
      return col.find({ uid, campaignId }).toArray();
    }

    const db = this._getFirestore();
    const snap = await db
      .collection('users')
      .doc(uid)
      .collection('campaigns')
      .doc(campaignId)
      .collection(siloName)
      .get();

    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  async archiveScene(uid, campaignId, sceneObj) {
    const docId = sceneObj.id || `scene_${Date.now()}`;
    return this.writeRecord(uid, campaignId, ARCHIVIST_SILOS.HISTORICAL_MEMORY, docId, {
      locationId: sceneObj.locationId || '',
      timeAndDate: sceneObj.timeAndDate || '',
      mood: sceneObj.mood || '',
      summary: sceneObj.summary || '',
      significantDialogue: sceneObj.significantDialogue || [],
      characterStateChanges: sceneObj.characterStateChanges || [],
    });
  }

  async archivePermanentNpc(uid, campaignId, npcObj) {
    return this.writeRecord(uid, campaignId, ARCHIVIST_SILOS.NPC_GENETICS_ARCHIVE, npcObj.id, {
      npcId: npcObj.id,
      name: npcObj.name,
      currentTier: npcObj.currentTier,
      relationalXP: npcObj.relationalXP,
      permanenceUnlocked: true,
      portraitRef: npcObj.portraitRef || null,
      genetics: npcObj.genetics,
    });
  }

  async archiveLoreEntry(uid, campaignId, entryId, loreData) {
    return this.writeRecord(uid, campaignId, ARCHIVIST_SILOS.WORLD_LORE_CODEX, entryId, loreData);
  }

  async recordVisualAsset(uid, campaignId, assetId, assetMeta) {
    return this.writeRecord(uid, campaignId, ARCHIVIST_SILOS.VISUAL_ASSET_LEDGER, assetId, assetMeta);
  }
}

module.exports = { ArchivistService };
