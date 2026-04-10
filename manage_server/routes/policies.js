const router = require('express').Router();
const db     = require('../db/db');
const { authenticate } = require('../middleware/auth');

/**
 * @openapi
 * tags:
 *   - name: Policies
 *     description: CRUD for per-user domain policy rules
 */

/**
 * @openapi
 * /api/policies:
 *   get:
 *     tags: [Policies]
 *     summary: List all policies for the current user
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Array of policy objects
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Policy'
 *       401:
 *         description: Unauthorized
 */
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

/**
 * @openapi
 * /api/policies:
 *   post:
 *     tags: [Policies]
 *     summary: Create a new domain policy rule
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [domain, action]
 *             properties:
 *               domain:
 *                 type: string
 *                 example: "facebook.com"
 *               action:
 *                 type: string
 *                 enum: [BLOCK, TUNNEL, DIRECT]
 *                 example: BLOCK
 *     responses:
 *       201:
 *         description: Policy created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Policy'
 *       409:
 *         description: Policy for this domain already exists
 *       422:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/', authenticate, async (req, res) => {
  const { domain, action } = req.body || {};
  const validActions = ['BLOCK', 'TUNNEL', 'DIRECT'];

  const DOMAIN_RE = /^(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}|(?:\d{1,3}\.){3}\d{1,3}|localhost)$/;

  if (!domain || !action) {
    return res.status(422).json({ error: 'domain and action are required' });
  }
  // strip protocol prefix and path if user pastes a full URL
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
    res.status(201).json({ id: result.insertId, domain, action });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A policy for this domain already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/policies/{id}:
 *   put:
 *     tags: [Policies]
 *     summary: Update a policy rule's action
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [BLOCK, TUNNEL, DIRECT]
 *     responses:
 *       200:
 *         description: Policy updated
 *       404:
 *         description: Policy not found or not owned by user
 *       401:
 *         description: Unauthorized
 */
router.put('/:id', authenticate, async (req, res) => {
  const { action } = req.body || {};
  const validActions = ['BLOCK', 'TUNNEL', 'DIRECT'];
  if (!action || !validActions.includes(action)) {
    return res.status(422).json({ error: `action must be one of: ${validActions.join(', ')}` });
  }

  try {
    const [result] = await db.execute(
      'UPDATE policies SET action = ? WHERE id = ? AND user_id = ?',
      [action, req.params.id, req.user.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Policy not found' });
    }
    res.json({ message: 'Policy updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/policies/{id}:
 *   delete:
 *     tags: [Policies]
 *     summary: Delete a policy rule
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 3
 *     responses:
 *       200:
 *         description: Policy deleted
 *       404:
 *         description: Policy not found
 *       401:
 *         description: Unauthorized
 */
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
