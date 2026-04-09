const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const db     = require('../db/db');

/**
 * @openapi
 * tags:
 *   - name: Auth
 *     description: User registration and login
 */

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *                 example: alice
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "S3curePass!"
 *     responses:
 *       201:
 *         description: User created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserCreated'
 *       409:
 *         description: Username already exists
 *       422:
 *         description: Validation error
 */
router.post('/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(422).json({ error: 'username and password are required' });
  }
  if (username.length < 3 || username.length > 64) {
    return res.status(422).json({ error: 'username must be 3–64 characters' });
  }
  if (password.length < 8) {
    return res.status(422).json({ error: 'password must be at least 8 characters' });
  }

  const hash = await bcrypt.hash(password, 10);
  try {
    const [result] = await db.execute(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [username, hash]
    );
    res.status(201).json({ id: result.insertId, username });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Username already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login and receive a JWT token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *                 example: admin
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "admin123"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(422).json({ error: 'username and password are required' });
  }

  const [rows] = await db.execute(
    'SELECT id, username, password_hash, role FROM users WHERE username = ?',
    [username]
  );
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );

  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

module.exports = router;
