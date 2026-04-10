require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const https   = require('https');
const fs      = require('fs');

// routes
const authRoutes     = require('./routes/auth');
const rulesRoutes    = require('./routes/rules');
const policiesRoutes = require('./routes/policies');
const logsRoutes     = require('./routes/logs');
const usersRoutes    = require('./routes/users');

const app      = express();
const PORT     = process.env.PORT || 3001;
const USE_HTTPS = process.env.USE_HTTPS === 'true';

// middlewares
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',');
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error('Not allowed by CORS'));
  },
}));
app.use(express.json());

// api routes
app.use('/api/auth',     authRoutes);
app.use('/api/rules',    rulesRoutes);
app.use('/api/policies', policiesRoutes);
app.use('/api/logs',     logsRoutes);
app.use('/api/users',    usersRoutes);

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// error handler
app.use((err, _req, res, _next) => {
  console.error('error: ', err);
  res.status(500).json({ error: 'Internal server error' });
});

// start the server
if (USE_HTTPS) {
  const sslKey  = fs.readFileSync(process.env.SSL_KEY_PATH  || './certs/key.pem');
  const sslCert = fs.readFileSync(process.env.SSL_CERT_PATH || './certs/cert.pem');
  https.createServer({ key: sslKey, cert: sslCert }, app).listen(PORT, () => {
    console.log(`\nserver running on https://localhost:${PORT}`);
  });
} else {
  app.listen(PORT, () => {
    console.log(`\nserver running on http://localhost:${PORT}`);
  });
}

module.exports = app;
