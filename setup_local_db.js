process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'root';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || '';
process.env.DB_NAME = process.env.DB_NAME || 'goddygraphix';
process.env.DB_PORT = process.env.DB_PORT || '3306';

require('./reset_admin');
