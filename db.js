const mysql = require('mysql2/promise');
require('dotenv').config();

// Ensure MYSQL_URL is defined and non‑empty
if (!process.env.MYSQL_URL) {
  console.error('[DB] Critical: MYSQL_URL not set.');
  throw new Error('Missing MYSQL_URL environment variable');
}

// Trim any stray whitespace/newlines
const mysqlUrl = process.env.MYSQL_URL.trim();

console.log(`[DB] Attempting connection via MYSQL_URL`);

// Create pool using the URL string
const pool = mysql.createPool({
  uri: mysqlUrl,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: { rejectUnauthorized: false }
});


// Simple connection test – logs success or detailed error
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('[DB] Connection test successful');
    conn.release();
  } catch (err) {
    console.error('[DB] Connection test failed:', err.message);
  }
})();

module.exports = pool;
