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

router.post('/', authenticate, logsLimiter, async (req, res) => {
  const { bytes_sent } = req.body || {};
  const rawDomain = String(req.body?.domain || '');
  const domain = rawDomain.trim().toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/[/?#].*$/, '')
    .slice(0, 253);
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

router.get('/', authenticate, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
  const since = req.query.since || null;

  let query, params;
  if (req.user.role === 'admin') {
    query = `
      SELECT tl.id, tl.user_id, u.username, tl.domain, tl.bytes_sent, tl.timestamp
      FROM traffic_logs tl
      JOIN users u ON u.id = tl.user_id
      ${since ? 'WHERE tl.timestamp > ?' : ''}
      ORDER BY tl.timestamp DESC
      LIMIT ${limit}`;
    params = since ? [since] : [];
  } else {
    query = `
      SELECT id, user_id, domain, bytes_sent, timestamp
      FROM traffic_logs
      WHERE user_id = ?
      ${since ? 'AND timestamp > ?' : ''}
      ORDER BY timestamp DESC
      LIMIT ${limit}`;
    params = since ? [req.user.id, since] : [req.user.id];
  }

  try {
    const [rows] = await db.execute(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
