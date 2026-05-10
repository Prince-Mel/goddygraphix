const mysql = require('mysql2/promise');
require('dotenv').config();

const hasMysqlUrl = !!process.env.MYSQL_URL;
const hasLocalConfig = !!(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME);

if (!hasMysqlUrl && !hasLocalConfig) {
  console.error('[DB] Critical: MYSQL_URL or DB_HOST/DB_USER/DB_NAME must be set.');
  throw new Error('Missing database environment variables');
}

const baseConfig = {
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const poolConfig = hasMysqlUrl
  ? {
      ...baseConfig,
      uri: process.env.MYSQL_URL.trim(),
      ssl: { rejectUnauthorized: false }
    }
  : {
      ...baseConfig,
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || process.env.DB_PASS || '',
      database: process.env.DB_NAME,
      port: process.env.DB_PORT || 3306
    };

console.log(`[DB] Attempting connection via ${hasMysqlUrl ? 'MYSQL_URL' : 'DB_HOST/DB_USER/DB_NAME'}`);

const pool = mysql.createPool(poolConfig);

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
