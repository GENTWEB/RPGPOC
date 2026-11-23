'use strict';

const crypto = require('crypto');

let admin = null;
let initialized = false;
let firestoreInstance = null;
let storageBucket = null;

function createInMemoryFirestore() {
  const store = new Map();

  function clone(val) {
    return val === undefined ? undefined : JSON.parse(JSON.stringify(val));
  }

  function makeDocRef(docPath) {
    return {
      path: docPath,
      id: docPath.split('/').pop(),
      async get() {
        const exists = store.has(docPath);
        const data = exists ? clone(store.get(docPath)) : undefined;
        return {
          exists,
          id: docPath.split('/').pop(),
          data: () => data,
        };
      },
      async set(data, opts = {}) {
        if (opts && opts.merge && store.has(docPath)) {
          const prev = store.get(docPath);
          store.set(docPath, clone({ ...prev, ...data }));
        } else {
          store.set(docPath, clone(data));
        }
      },
      async update(data) {
        const prev = store.get(docPath) || {};
        store.set(docPath, clone({ ...prev, ...data }));
      },
      async delete() {
        store.delete(docPath);
      },
      collection(subName) {
        return makeCollectionRef(`${docPath}/${subName}`);
      },
    };
  }

  function makeCollectionRef(colPath) {
    return {
      path: colPath,
      doc(id) {
        const docId = id || crypto.randomUUID();
        return makeDocRef(`${colPath}/${docId}`);
      },
      async add(data) {
        const docId = crypto.randomUUID();
        const ref = makeDocRef(`${colPath}/${docId}`);
        await ref.set(data);
        return ref;
      },
      orderBy(field, direction = 'asc') {
        return {
          limit(n) {
            return {
              async get() {
                const all = await makeCollectionRef(colPath).get();
                const sorted = [...all.docs].sort((a, b) => {
                  const av = a.data()?.[field] ?? 0;
                  const bv = b.data()?.[field] ?? 0;
                  return direction === 'desc' ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
                });
                return { docs: sorted.slice(0, n) };
              },
            };
          },
          async get() {
            const all = await makeCollectionRef(colPath).get();
            const sorted = [...all.docs].sort((a, b) => {
              const av = a.data()?.[field] ?? 0;
              const bv = b.data()?.[field] ?? 0;
              return direction === 'desc' ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
            });
            return { docs: sorted };
          },
        };
      },
      async get() {
        const prefix = `${colPath}/`;
        const docs = [];
        for (const [k, v] of store.entries()) {
          if (k.startsWith(prefix) && !k.slice(prefix.length).includes('/')) {
            const id = k.slice(prefix.length);
            docs.push({
              id,
              exists: true,
              data: () => clone(v),
              ref: makeDocRef(k),
            });
          }
        }
        return { docs, empty: docs.length === 0, size: docs.length };
      },
    };
  }

  return {
    collection: makeCollectionRef,
    doc: makeDocRef,
    _store: store,
  };
}

function initFirebaseAdmin() {
  if (initialized) {
    return { admin, db: firestoreInstance, bucket: storageBucket };
  }

  try {
    admin = require('firebase-admin');
  } catch (_) {
    admin = null;
  }

  if (admin && process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`,
      });
    }
    firestoreInstance = admin.firestore();
    storageBucket = admin.storage().bucket();
  } else {
    firestoreInstance = createInMemoryFirestore();
    storageBucket = null;
  }

  initialized = true;
  return { admin, db: firestoreInstance, bucket: storageBucket };
}

function getDb() {
  return initFirebaseAdmin().db;
}

function getBucket() {
  return initFirebaseAdmin().bucket;
}

function getAdminAuth() {
  const ctx = initFirebaseAdmin();
  if (ctx.admin && ctx.admin.apps && ctx.admin.apps.length > 0) {
    return ctx.admin.auth();
  }
  return null;
}

module.exports = {
  initFirebaseAdmin,
  getDb,
  getBucket,
  getAdminAuth,
  createInMemoryFirestore,
};
