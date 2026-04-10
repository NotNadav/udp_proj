const router    = require('express').Router();
const db        = require('../db/db');
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../middleware/auth');

const logsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many log submissions, slow down.' },
});

/**
 * @openapi
 * tags:
 *   - name: Logs
 *     description: Traffic log ingestion and retrieval
 */

/**
 * @openapi
 * /api/logs:
 *   post:
 *     tags: [Logs]
 *     summary: Report traffic bytes (called by the gateway/agent)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bytes_sent]
 *             properties:
 *               domain:
 *                 type: string
 *                 example: "google.com"
 *               bytes_sent:
 *                 type: integer
 *                 example: 4096
 *     responses:
 *       201:
 *         description: Log entry recorded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LogEntry'
 *       422:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/', authenticate, logsLimiter, async (req, res) => {
  const { domain = '', bytes_sent } = req.body || {};
  if (bytes_sent === undefined || typeof bytes_sent !== 'number' || bytes_sent < 0) {
    return res.status(422).json({ error: 'bytes_sent must be a non-negative number' });
  }

  try {
    const [result] = await db.execute(
      'INSERT INTO traffic_logs (user_id, domain, bytes_sent) VALUES (?, ?, ?)',
      [req.user.id, domain, bytes_sent]
    );
    res.status(201).json({ id: result.insertId, user_id: req.user.id, domain, bytes_sent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/logs/health:
 *   post:
 *     tags: [Logs]
 *     summary: Report packet drops (ARQ retransmissions)
 *     security:
 *       - BearerAuth: []
 */
router.post('/health', authenticate, async (req, res) => {
  const retransmissions = parseInt(req.body?.retransmissions) || 0;
  try {
    await db.execute(
      `INSERT INTO network_health (user_id, retransmissions)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE retransmissions = VALUES(retransmissions), updated_at = NOW()`,
      [req.user.id, retransmissions]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/logs/health:
 *   get:
 *     tags: [Logs]
 *     summary: Get network health stats (Admin only)
 *     security:
 *       - BearerAuth: []
 */
router.get('/health', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  try {
    const [rows] = await db.execute(
      `SELECT u.username, nh.retransmissions, nh.updated_at
       FROM network_health nh
       JOIN users u ON u.id = nh.user_id
       ORDER BY nh.updated_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/logs:
 *   get:
 *     tags: [Logs]
 *     summary: Retrieve traffic logs for the current user (or all users for admin)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Max rows to return
 *       - in: query
 *         name: since
 *         schema:
 *           type: string
 *           format: date-time
 *         description: ISO 8601 timestamp filter (return logs after this time)
 *     responses:
 *       200:
 *         description: Array of log entries
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/LogEntry'
 *       401:
 *         description: Unauthorized
 */
router.get('/', authenticate, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
  const since = req.query.since || null;

  let query, params;
  if (req.user.role === 'admin') {
    // Admins see all users' logs with username
    query = `
      SELECT tl.id, tl.user_id, u.username, tl.domain, tl.bytes_sent, tl.timestamp
      FROM traffic_logs tl
      JOIN users u ON u.id = tl.user_id
      ${since ? 'WHERE tl.timestamp > ?' : ''}
      ORDER BY tl.timestamp DESC
      LIMIT ?`;
    params = since ? [since, limit] : [limit];
  } else {
    query = `
      SELECT id, user_id, domain, bytes_sent, timestamp
      FROM traffic_logs
      WHERE user_id = ?
      ${since ? 'AND timestamp > ?' : ''}
      ORDER BY timestamp DESC
      LIMIT ?`;
    params = since ? [req.user.id, since, limit] : [req.user.id, limit];
  }

  try {
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/logs/summary:
 *   get:
 *     tags: [Logs]
 *     summary: Aggregated bytes per user (for dashboard chart)
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of users with total bytes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   username:
 *                     type: string
 *                   total_bytes:
 *                     type: integer
 *       401:
 *         description: Unauthorized
 */
router.get('/summary', authenticate, async (req, res) => {
  const userFilter = req.user.role !== 'admin' ? 'WHERE tl.user_id = ?' : '';
  const params     = req.user.role !== 'admin' ? [req.user.id] : [];

  try {
    const [rows] = await db.execute(`
      SELECT u.username, SUM(tl.bytes_sent) AS total_bytes
      FROM traffic_logs tl
      JOIN users u ON u.id = tl.user_id
      ${userFilter}
      GROUP BY u.id, u.username
      ORDER BY total_bytes DESC
    `, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
