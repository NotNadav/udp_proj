const router = require('express').Router();
const db     = require('../db/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.get('/', authenticate, requireAdmin, async (req, res) => {
  const [users] = await db.execute(
    'SELECT id, username, role, created_at FROM users ORDER BY created_at DESC'
  );
  res.json(users);
});

router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }

  const [result] = await db.execute('DELETE FROM users WHERE id = ?', [userId]);
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ message: 'User correctly deleted (Killswitch engaged)' });
});

module.exports = router;
