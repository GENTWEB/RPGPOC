'use strict';

const { getAdminAuth } = require('../config/firebaseAdmin');

/**
 * Zero-Leak JWT Gate:
 * Validates Firebase ID JWT on every /api/* route using Admin SDK.
 * Strictly derives req.user.uid from the verified token and strips any
 * client-supplied uid or ownerId from body/query to prevent spoofing.
 */
async function verifyAuth(req, res, next) {
  try {
    if (req.body && typeof req.body === 'object') {
      delete req.body.uid;
      delete req.body.ownerId;
      delete req.body.ownerUid;
    }
    if (req.query && typeof req.query === 'object') {
      delete req.query.uid;
      delete req.query.ownerId;
      delete req.query.ownerUid;
    }

    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'PERMISSION_DENIED',
        message: 'Missing or malformed Bearer Firebase ID token.',
      });
    }

    const idToken = authHeader.slice(7).trim();
    if (!idToken) {
      return res.status(401).json({
        error: 'PERMISSION_DENIED',
        message: 'Empty Bearer token.',
      });
    }

    const adminAuth = getAdminAuth();
    if (!adminAuth) {
      if (process.env.NODE_ENV === 'test' && idToken.startsWith('test-uid:')) {
        const uid = idToken.slice('test-uid:'.length).trim();
        if (!uid) {
          return res.status(401).json({ error: 'PERMISSION_DENIED', message: 'Invalid test token.' });
        }
        req.user = { uid, email: `${uid}@test.local`, name: uid };
        return next();
      }
      return res.status(503).json({
        error: 'AUTH_UNAVAILABLE',
        message: 'Firebase Admin Auth is not configured on the server.',
      });
    }

    const decoded = await adminAuth.verifyIdToken(idToken, true);
    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
      name: decoded.name || null,
      picture: decoded.picture || null,
    };
    return next();
  } catch (err) {
    return res.status(401).json({
      error: 'PERMISSION_DENIED',
      message: 'Invalid or expired Firebase ID token.',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
}

module.exports = { verifyAuth };
