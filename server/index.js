'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const { initFirebaseAdmin } = require('./config/firebaseAdmin');
const { verifyAuth } = require('./middleware/verifyAuth');
const { apiLimiter } = require('./middleware/rateLimiter');

const authRoutes = require('./routes/authRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const turnRoutes = require('./routes/turnRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const saveRoutes = require('./routes/saveRoutes');

initFirebaseAdmin();

const app = express();

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',') : ['http://localhost:5173'],
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Health endpoint (non-sensitive)
app.get('/health', (req, res) => {
  res.json({
    service: 'De Laval Narrative RPG Engine',
    version: '7.2',
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Zero-Leak JWT Gate applied to every /api/* route
app.use('/api', verifyAuth, apiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/turns', turnRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/saves', saveRoutes);

app.use((err, req, res, _next) => {
  console.error('[DeLaval Server Error]', err);
  res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' });
});

const PORT = process.env.PORT || 8080;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`De Laval Narrative RPG Engine v7.2 listening on port ${PORT}`);
  });
}

module.exports = app;
