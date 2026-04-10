require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const https        = require('https');
const fs           = require('fs');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi    = require('swagger-ui-express');

// routes
const authRoutes     = require('./routes/auth');
const rulesRoutes    = require('./routes/rules');
const policiesRoutes = require('./routes/policies');
const logsRoutes     = require('./routes/logs');
const usersRoutes    = require('./routes/users');

const app      = express();
const PORT     = process.env.PORT || 3001;
const USE_HTTPS = process.env.USE_HTTPS === 'true';
const protocol  = USE_HTTPS ? 'https' : 'http';

// middlewares
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',');
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error('Not allowed by CORS'));
  },
}));
app.use(express.json());

// swagger documentation
const swaggerDefinition = {
  openapi: '3.0.3',
  info: {
    title: 'UDP Proxy Management API',
    version: '1.0.0',
    description: `
RESTful management API for the UDP-tunneled SOCKS5 proxy system.

Handles **user authentication** (JWT), **policy rules** consumed by the Python client agent,
and **traffic log** ingestion/reporting from the gateway.

### Default credentials (development seed)
| Username | Password  | Role  |
|----------|-----------|-------|
| admin    | admin123  | admin |
    `,
    contact: {
      name: 'UDP Proxy Team',
    },
    license: {
      name: 'MIT',
    },
  },
  servers: [
    { url: `${protocol}://localhost:${PORT}`, description: 'Local development' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Obtain a JWT from POST /api/auth/login and paste it here.',
      },
    },
    schemas: {
      UserCreated: {
        type: 'object',
        properties: {
          id:       { type: 'integer', example: 1 },
          username: { type: 'string',  example: 'alice' },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
          user: {
            type: 'object',
            properties: {
              id:       { type: 'integer', example: 1 },
              username: { type: 'string',  example: 'admin' },
              role:     { type: 'string',  enum: ['admin', 'user'] },
            },
          },
        },
      },
      Policy: {
        type: 'object',
        properties: {
          id:         { type: 'integer', example: 1 },
          domain:     { type: 'string',  example: 'facebook.com' },
          action:     { type: 'string',  enum: ['BLOCK', 'TUNNEL', 'DIRECT'] },
          created_at: { type: 'string',  format: 'date-time' },
        },
      },
      RulesPayload: {
        type: 'object',
        properties: {
          blocked_domains:   { type: 'array', items: { type: 'string' }, example: ['facebook.com'] },
          tunnel_domains:    { type: 'array', items: { type: 'string' }, example: ['google.com'] },
          direct_domains:    { type: 'array', items: { type: 'string' }, example: ['example.com'] },
          default_action:    { type: 'string', example: 'DIRECT' },
        },
      },
      LogEntry: {
        type: 'object',
        properties: {
          id:         { type: 'integer', example: 42 },
          user_id:    { type: 'integer', example: 1 },
          username:   { type: 'string',  example: 'alice', description: 'Included in admin view' },
          domain:     { type: 'string',  example: 'google.com' },
          bytes_sent: { type: 'integer', example: 4096 },
          timestamp:  { type: 'string',  format: 'date-time' },
        },
      },
    },
  },
};

const swaggerOptions = {
  swaggerDefinition,
  apis: ['./routes/*.js'],   // scan all route files for @openapi annotations
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// swagger ui
app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'UDP Proxy API Docs',
    swaggerOptions: { persistAuthorization: true },
  })
);

// export json spec
app.get('/api-docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// api routes
app.use('/api/auth',     authRoutes);
app.use('/api/rules',    rulesRoutes);
app.use('/api/policies', policiesRoutes);
app.use('/api/logs',     logsRoutes);
app.use('/api/users',    usersRoutes);

// health check
/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Server health check
 *     responses:
 *       200:
 *         description: OK
 */
app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date() }));

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
    console.log(`swagger ui:  https://localhost:${PORT}/api-docs`);
    console.log(`openapi spec:     https://localhost:${PORT}/api-docs.json\n`);
  });
} else {
  app.listen(PORT, () => {
    console.log(`\nserver running on http://localhost:${PORT}`);
    console.log(`swagger ui:  http://localhost:${PORT}/api-docs`);
    console.log(`openapi spec:     http://localhost:${PORT}/api-docs.json\n`);
  });
}

module.exports = app;
