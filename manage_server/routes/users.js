const router = require('express').Router();
const db     = require('../db/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

/**
 * @openapi
 * tags:
 *   - name: Users
 *     description: User management for admins
 */

/**
 * @openapi
 * /api/users:
 *   get:
 *     tags: [Users]
 *     summary: Get all users (Admin only)
 *     security:
 *       - BearerAuth: []
 */
router.get('/', authenticate, requireAdmin, async (req, res) => {
  const [users] = await db.execute(
    'SELECT id, username, role, created_at FROM users ORDER BY created_at DESC'
  );
  res.json(users);
});

/**
 * @openapi
 * /api/users/{id}:
 *   delete:
 *     tags: [Users]
 *     summary: Delete a user by ID - Killswitch (Admin only)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 */
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }

  const [result] = await db.execute('DELETE FROM users WHERE id = ?', [userId]);
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Clean up global network health data if exists
  if (global.networkHealth && global.networkHealth[userId]) {
    delete global.networkHealth[userId];
  }

  res.json({ message: 'User correctly deleted (Killswitch engaged)' });
});

module.exports = router;
