'use strict';

const { Readable } = require('stream');

/**
 * Google Drive REST API v3 Save Export Service.
 * Scoped narrowly to https://www.googleapis.com/auth/drive.file so it can only
 * manage DeLaval_Save_{campaignId}.json files created by this app.
 */
async function upsertCampaignSaveToDrive({ googleAccessToken, campaignId, savePayload }) {
  if (!googleAccessToken) {
    return { synced: false, reason: 'Google Drive OAuth token not connected.' };
  }

  const { google } = require('googleapis');
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: googleAccessToken });
  const drive = google.drive({ version: 'v3', auth });

  const fileName = `DeLaval_Save_${campaignId}.json`;
  const jsonContent = JSON.stringify(savePayload, null, 2);

  const searchRes = await drive.files.list({
    q: `name = '${fileName.replace(/'/g, "\\'")}' and trashed = false`,
    fields: 'files(id, name, webViewLink)',
    spaces: 'drive',
  });

  const existing = searchRes.data.files?.[0];
  const media = {
    mimeType: 'application/json',
    body: Readable.from([jsonContent]),
  };

  if (existing) {
    const updated = await drive.files.update({
      fileId: existing.id,
      media,
      fields: 'id, name, webViewLink, modifiedTime',
    });
    return {
      synced: true,
      action: 'updated',
      fileId: updated.data.id,
      fileName: updated.data.name,
      webViewLink: updated.data.webViewLink,
    };
  }

  const created = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType: 'application/json',
    },
    media,
    fields: 'id, name, webViewLink, modifiedTime',
  });

  return {
    synced: true,
    action: 'created',
    fileId: created.data.id,
    fileName: created.data.name,
    webViewLink: created.data.webViewLink,
  };
}

function runPreSaveChecklist(campaignState) {
  const issues = [];
  if (!campaignState.metaData) issues.push('Missing metaData block.');
  if (!campaignState.sceneMemory?.currentScene) issues.push('Missing currentScene.');
  const players = campaignState.activeEntities?.players || [];
  if (players.length === 0) issues.push('No active player characters.');

  for (const pc of players) {
    if (typeof pc.combatStats?.health !== 'number') {
      issues.push(`Player ${pc.id} has invalid HP.`);
    }
  }

  const sanitized = {
    metaData: {
      ...campaignState.metaData,
      project: 'Integrated_De_Laval_Engine',
      version: '7.2_Synchronized_Schema',
      timestamp: new Date().toISOString(),
    },
    globalState: campaignState.globalState,
    narratorState: campaignState.narratorState,
    sceneMemory: campaignState.sceneMemory,
    worldState: campaignState.worldState,
    activeEntities: campaignState.activeEntities,
  };

  return {
    ok: issues.length === 0,
    issues,
    payload: sanitized,
  };
}

module.exports = {
  upsertCampaignSaveToDrive,
  runPreSaveChecklist,
};
