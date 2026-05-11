require('dotenv').config();

const bcrypt = require('bcryptjs');
const pool = require('./db');

const username = (process.env.ADMIN_USERNAME || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';

async function resetAdmin() {
    try {
        if (!username || !password) {
            throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD are required.');
        }

        if (password.length < 12) {
            throw new Error('ADMIN_PASSWORD must be at least 12 characters long.');
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const [users] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);

        if (users.length > 0) {
            await pool.query('UPDATE users SET password = ?, role = ? WHERE username = ?', [hashedPassword, 'admin', username]);
            console.log(`Admin '${username}' password has been updated.`);
        } else {
            await pool.query('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, hashedPassword, 'admin']);
            console.log(`Admin '${username}' has been created.`);
        }

        await pool.query('DELETE FROM sessions WHERE username = ?', [username]).catch(() => {});
        console.log('Admin bootstrap completed. Password was not printed.');
        process.exit(0);
    } catch (err) {
        console.error('Admin bootstrap failed:', err.message);
        process.exit(1);
    }
}

resetAdmin();
