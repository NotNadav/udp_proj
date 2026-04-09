const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || '127.0.0.1',
  port:               parseInt(process.env.DB_PORT || '3306'),
  user:               process.env.DB_USER     || 'proxy_user',
  password:           process.env.DB_PASS     || '',
  database:           process.env.DB_NAME     || 'udp_proxy_db',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  charset:            'utf8mb4',
});

// Test connectivity on startup
pool.getConnection()
  .then(conn => {
    console.log('db: MySQL connected successfully.');
    conn.release();
  })
  .catch(err => {
    console.error('db: Connection failed:', err.message);
    process.exit(1);
  });

module.exports = pool;
