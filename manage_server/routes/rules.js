const router = require('express').Router();
const db     = require('../db/db');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, async (req, res) => {
  // live killswitch validation
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
