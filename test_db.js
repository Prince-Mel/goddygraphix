require('dotenv').config();
const mysql = require('mysql2/promise');

async function testConnection() {
    console.log('Testing MySQL connection with:');
    console.log('  Host:', process.env.DB_HOST);
    console.log('  User:', process.env.DB_USER);
    console.log('  Database:', process.env.DB_NAME);
    console.log('  Port:', process.env.DB_PORT || 3306);
    
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'goddygraphix',
            port: process.env.DB_PORT || 3306
        });
        
        console.log('\n✅ SUCCESS! Connected to MySQL');
        
        const [rows] = await connection.query('SELECT 1 as test');
        console.log('Test query result:', rows);
        
        // Check if database exists
        const [dbs] = await connection.query(`SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = '${process.env.DB_NAME || 'goddygraphix'}'`);
        if (dbs.length === 0) {
            console.log(`\n⚠️  WARNING: Database '${process.env.DB_NAME || 'goddygraphix'}' does not exist!`);
            console.log('Creating database...');
            await connection.query(`CREATE DATABASE ${process.env.DB_NAME || 'goddygraphix'}`);
            console.log('✅ Database created!');
        } else {
            console.log(`\n✅ Database '${process.env.DB_NAME || 'goddygraphix'}' exists`);
        }
        
        await connection.end();
        console.log('\nAll tests passed!');
    } catch (err) {
        console.error('\n❌ FAILED to connect!');
        console.error('Error:', err.message);
        console.error('Code:', err.code);
        console.error('\nCommon fixes:');
        console.error('1. Make sure MySQL is running');
        console.error('2. Check username/password are correct');
        console.error('3. Make sure the user has permission to access the database');
    }
}

testConnection();
