const router = require('express').Router();
const db     = require('../db/db');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, domain, action, created_at FROM policies WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authenticate, async (req, res) => {
  const { domain, action } = req.body || {};
  const validActions = ['BLOCK', 'TUNNEL', 'DIRECT'];

  const DOMAIN_RE = /^(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}|(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?|localhost)$/;

  if (!domain || !action) {
    return res.status(422).json({ error: 'domain and action are required' });
  }
  const cleanDomain = domain.trim().toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/[/?#].*$/, '');
  if (!DOMAIN_RE.test(cleanDomain)) {
    return res.status(422).json({ error: 'Invalid domain format' });
  }
  if (!validActions.includes(action)) {
    return res.status(422).json({ error: `action must be one of: ${validActions.join(', ')}` });
  }

  try {
    const [result] = await db.execute(
      'INSERT INTO policies (user_id, domain, action) VALUES (?, ?, ?)',
      [req.user.id, cleanDomain, action]
    );
    res.status(201).json({ id: result.insertId, domain: cleanDomain, action });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A policy for this domain already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  const { action } = req.body || {};
  const validActions = ['BLOCK', 'TUNNEL', 'DIRECT'];
  if (!action || !validActions.includes(action)) {
    return res.status(422).json({ error: `action must be one of: ${validActions.join(', ')}` });
  }

  try {
    const [policyRows] = await db.execute(
      'SELECT domain FROM policies WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (policyRows.length === 0) {
      return res.status(404).json({ error: 'Policy not found' });
    }
    await db.execute(
      'UPDATE policies SET action = ? WHERE id = ? AND user_id = ?',
      [action, req.params.id, req.user.id]
    );
    res.json({ message: 'Policy updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const [result] = await db.execute(
      'DELETE FROM policies WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Policy not found' });
    }
    res.json({ message: 'Policy deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
