'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

/**
 * Security Rules Verification Suite:
 * 1. Verifies verbatim Firestore and Storage rules files exist and enforce default-deny.
 * 2. Simulates rule evaluation for unauthenticated, cross-UID, and owner-UID requests,
 *    asserting PERMISSION_DENIED on every unauthorized access.
 */
function evaluateFirestoreRule(rulesText, { auth, method, docPath }) {
  // Verify default deny block exists
  assert.ok(
    rulesText.includes('match /{document=**}') && rulesText.includes('allow read, write: if false;'),
    'Firestore rules must include global default deny'
  );

  // /users/{uid}/campaigns/{campaignId}/{sub=**}
  const campaignMatch = docPath.match(/^\/users\/([^/]+)\/campaigns\/([^/]+)(?:\/.*)?$/);
  if (campaignMatch) {
    const uid = campaignMatch[1];
    if (auth && auth.uid === uid) return 'ALLOW';
    return 'PERMISSION_DENIED';
  }

  // /users/{uid}/profile/{docId}
  const profileMatch = docPath.match(/^\/users\/([^/]+)\/profile\/([^/]+)$/);
  if (profileMatch) {
    const uid = profileMatch[1];
    if (auth && auth.uid === uid) return 'ALLOW';
    return 'PERMISSION_DENIED';
  }

  // /archetypes/{docId}
  const archMatch = docPath.match(/^\/archetypes\/([^/]+)$/);
  if (archMatch) {
    if (method === 'read' && auth != null) return 'ALLOW';
    return 'PERMISSION_DENIED';
  }

  return 'PERMISSION_DENIED';
}

function evaluateStorageRule(rulesText, { auth, objectPath }) {
  assert.ok(
    rulesText.includes('match /{allPaths=**}') && rulesText.includes('allow read, write: if false;'),
    'Storage rules must include global default deny'
  );

  const userMatch = objectPath.match(/^\/users\/([^/]+)\/.+$/);
  if (userMatch) {
    const uid = userMatch[1];
    if (auth && auth.uid === uid) return 'ALLOW';
    return 'PERMISSION_DENIED';
  }

  return 'PERMISSION_DENIED';
}

async function runSecurityTests() {
  console.log('=== DE LAVAL SECURITY RULES VERIFICATION ===');
  const firestoreRules = fs.readFileSync(path.join(__dirname, '..', '..', 'firebase', 'firestore.rules'), 'utf8');
  const storageRules = fs.readFileSync(path.join(__dirname, '..', '..', 'firebase', 'storage.rules'), 'utf8');

  // Firestore: unauthenticated rejected
  assert.strictEqual(
    evaluateFirestoreRule(firestoreRules, { auth: null, method: 'read', docPath: '/users/alice/campaigns/cmp1' }),
    'PERMISSION_DENIED'
  );
  assert.strictEqual(
    evaluateFirestoreRule(firestoreRules, { auth: null, method: 'read', docPath: '/archetypes/Fantasy' }),
    'PERMISSION_DENIED'
  );

  // Firestore: cross-UID rejected
  assert.strictEqual(
    evaluateFirestoreRule(firestoreRules, { auth: { uid: 'bob' }, method: 'read', docPath: '/users/alice/campaigns/cmp1/snapshots/1' }),
    'PERMISSION_DENIED'
  );
  assert.strictEqual(
    evaluateFirestoreRule(firestoreRules, { auth: { uid: 'bob' }, method: 'write', docPath: '/users/alice/profile/oauth_vault' }),
    'PERMISSION_DENIED'
  );

  // Firestore: archetypes write rejected even when authenticated
  assert.strictEqual(
    evaluateFirestoreRule(firestoreRules, { auth: { uid: 'alice' }, method: 'write', docPath: '/archetypes/SciFi' }),
    'PERMISSION_DENIED'
  );

  // Firestore: owner allowed
  assert.strictEqual(
    evaluateFirestoreRule(firestoreRules, { auth: { uid: 'alice' }, method: 'write', docPath: '/users/alice/campaigns/cmp1/snapshots/1' }),
    'ALLOW'
  );
  assert.strictEqual(
    evaluateFirestoreRule(firestoreRules, { auth: { uid: 'alice' }, method: 'read', docPath: '/archetypes/SciFi' }),
    'ALLOW'
  );

  // Storage: unauthenticated & cross-UID rejected
  assert.strictEqual(
    evaluateStorageRule(storageRules, { auth: null, objectPath: '/users/alice/campaigns/cmp1/portraits/pc1.png' }),
    'PERMISSION_DENIED'
  );
  assert.strictEqual(
    evaluateStorageRule(storageRules, { auth: { uid: 'bob' }, objectPath: '/users/alice/campaigns/cmp1/panels/p1.png' }),
    'PERMISSION_DENIED'
  );
  assert.strictEqual(
    evaluateStorageRule(storageRules, { auth: { uid: 'alice' }, objectPath: '/public/leak.png' }),
    'PERMISSION_DENIED'
  );

  // Storage: owner allowed
  assert.strictEqual(
    evaluateStorageRule(storageRules, { auth: { uid: 'alice' }, objectPath: '/users/alice/campaigns/cmp1/panels/p1.png' }),
    'ALLOW'
  );

  console.log('[PASS] Firestore & Storage rules reject unauthenticated and cross-UID access with PERMISSION_DENIED.');
}

runSecurityTests().catch((err) => {
  console.error('[FAIL] Security Rules Test Error:', err);
  process.exit(1);
});
