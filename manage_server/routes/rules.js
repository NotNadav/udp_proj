const router = require('express').Router();
const db     = require('../db/db');
const { authenticate } = require('../middleware/auth');

/**
 * @openapi
 * tags:
 *   - name: Rules
 *     description: Policy rules consumed by the Python agent
 */

/**
 * @openapi
 * /api/rules:
 *   get:
 *     tags: [Rules]
 *     summary: Get policy rules for the authenticated user (used by the Python client agent)
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Structured rules object compatible with rules.json format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RulesPayload'
 *       401:
 *         description: Unauthorized
 */
router.get('/', authenticate, async (req, res) => {
  // Live killswitch validation
  const [users] = await db.execute('SELECT id FROM users WHERE id = ?', [req.user.id]);
  if (users.length === 0) {
    return res.status(401).json({ error: 'Access Revoked' });
  }

  const [rows] = await db.execute(
    'SELECT domain, action FROM policies WHERE user_id = ? ORDER BY action',
    [req.user.id]
  );

  const blocked_domains = rows.filter(r => r.action === 'BLOCK').map(r => r.domain);
  const tunnel_domains  = rows.filter(r => r.action === 'TUNNEL').map(r => r.domain);
  const direct_domains  = rows.filter(r => r.action === 'DIRECT').map(r => r.domain);

  res.json({
    blocked_domains,
    tunnel_domains,
    direct_domains,
    default_action: 'DIRECT',
  });
});

module.exports = router;
