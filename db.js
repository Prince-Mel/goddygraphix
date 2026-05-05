const mysql = require('mysql2/promise');
require('dotenv').config();

const connectionConfig = process.env.MYSQL_URL || {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'goddygraphix',
    port: process.env.DB_PORT || 3306,
    ssl: { rejectUnauthorized: false } // Always try SSL for production
};

console.log(`[DB] Attempting connection via ${process.env.MYSQL_URL ? 'MYSQL_URL' : 'Standard Config'}`);

const pool = process.env.MYSQL_URL 
    ? mysql.createPool(process.env.MYSQL_URL) 
    : mysql.createPool({
        ...connectionConfig,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

module.exports = pool;
