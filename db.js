const mysql = require('mysql2/promise');
require('dotenv').config();

const connectionConfig = process.env.MYSQL_URL || {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'goddygraphix',
    port: process.env.DB_PORT || 3306,
    ssl: (process.env.DB_SSL === 'true' || process.env.MYSQL_URL?.includes('sslmode=require')) 
         ? { rejectUnauthorized: false } 
         : null
};

const pool = mysql.createPool({
    ... (typeof connectionConfig === 'string' ? { uri: connectionConfig } : connectionConfig),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;
