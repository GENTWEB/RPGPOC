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
