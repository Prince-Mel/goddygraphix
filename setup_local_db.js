// Clear the problematic system env vars at runtime
delete process.env.DB_HOST;
delete process.env.DB_USER;
delete process.env.DB_PASSWORD;
delete process.env.DB_NAME;
delete process.env.DB_PORT;
delete process.env.DB_SSL;

require('dotenv').config();

// Override with local values
process.env.DB_HOST = '127.0.0.1';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = '';
process.env.DB_NAME = 'goddygraphix';
process.env.DB_PORT = '3306';
process.env.DB_SSL = 'false';

const bcrypt = require('bcryptjs');
const pool = require('./db');

const resetAdmin = async () => {
    try {
        const username = 'goddy';
        const password = 'goddy123';
        const hashedPassword = bcrypt.hashSync(password, 10);

        const [users] = await pool.query("SELECT * FROM users WHERE username = ?", [username]);

        if (users.length > 0) {
            await pool.query("UPDATE users SET password = ? WHERE username = ?", [hashedPassword, username]);
            console.log(`✓ Admin '${username}' password has been reset to '${password}'`);
        } else {
            await pool.query("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword]);
            console.log(`✓ Admin '${username}' has been created with password '${password}'`);
        }

        console.log('\nYou can now log in with:');
        console.log(`  Username: ${username}`);
        console.log(`  Password: ${password}`);

        process.exit(0);
    } catch (err) {
        console.error('✗ Error:', err.message);
        process.exit(1);
    }
};

resetAdmin();
