const jwt = require('jsonwebtoken');

/**
 * Express middleware: verifies Bearer JWT in Authorization header.
 * Sets req.user = { id, username, role } on success.
 */
function authenticate(req, res, next) {
  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id, username: decoded.username, role: decoded.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Middleware: requires req.user.role === 'admin'.
 * Must be used AFTER authenticate().
 */
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  next();
}

module.exports = { authenticate, requireAdmin };
