const bcrypt = require('bcryptjs');
const pool = require('./db');

const resetAdmin = async () => {
    try {
        const username = 'goddy';
        const password = 'goddy123';
        const hashedPassword = bcrypt.hashSync(password, 10);

        // Check if user exists
        const [users] = await pool.query("SELECT * FROM users WHERE username = ?", [username]);

        if (users.length > 0) {
            // Update existing user
            await pool.query("UPDATE users SET password = ? WHERE username = ?", [hashedPassword, username]);
            console.log(`✓ Admin '${username}' password has been reset to '${password}'`);
        } else {
            // Create new user
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
