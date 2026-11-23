'use strict';

const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user && req.user.uid ? req.user.uid : req.ip),
  message: {
    error: 'RATE_LIMITED',
    message: 'Too many requests. Please wait a moment before issuing another turn.',
  },
});

const mediaLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user && req.user.uid ? req.user.uid : req.ip),
  message: {
    error: 'MEDIA_RATE_LIMITED',
    message: 'Image generation rate limit reached. Please retry shortly.',
  },
});

module.exports = { apiLimiter, mediaLimiter };
