const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DB_FILE = path.join(__dirname, 'database.json');

async function migrate() {
    console.log("🚀 Starting Cloud Migration to Aiven...");

    if (!fs.existsSync(DB_FILE)) {
        console.error("❌ database.json not found. Nothing to migrate.");
        return;
    }

    const jsonData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

    // Create a connection to the Aiven database (using existing DB_NAME)
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 27870,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log(`✅ Connected to Aiven: ${process.env.DB_NAME}`);

        // 1. Create Tables
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL
            )
        `);
        
        await connection.query(`
            CREATE TABLE IF NOT EXISTS portfolio (
                id BIGINT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                category VARCHAR(255) NOT NULL,
                description TEXT,
                image_url VARCHAR(255) NOT NULL,
                visible BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS requests (
                id BIGINT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(50),
                service VARCHAR(100),
                subject VARCHAR(255),
                message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS settings (
                id INT PRIMARY KEY DEFAULT 1,
                announcement VARCHAR(255),
                show_announcement BOOLEAN DEFAULT TRUE
            )
        `);
        console.log("✅ Cloud table structure created.");

        // 2. Migrate Users
        if (jsonData.users && jsonData.users.length > 0) {
            for (const user of jsonData.users) {
                const [existing] = await connection.query("SELECT * FROM users WHERE username = ?", [user.username]);
                if (existing.length === 0) {
                    await connection.query("INSERT INTO users (username, password) VALUES (?, ?)", [user.username, user.password]);
                    console.log(`   - User '${user.username}' migrated to cloud.`);
                }
            }
        }

        // 3. Migrate Portfolio
        if (jsonData.portfolio && jsonData.portfolio.length > 0) {
            for (const item of jsonData.portfolio) {
                const [existing] = await connection.query("SELECT * FROM portfolio WHERE id = ?", [item.id]);
                if (existing.length === 0) {
                    await connection.query(
                        "INSERT INTO portfolio (id, title, category, description, image_url, visible, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        [item.id, item.title, item.category, item.description, item.image_url, item.visible, new Date(item.created_at || Date.now())]
                    );
                    console.log(`   - Portfolio item '${item.title}' migrated to cloud.`);
                }
            }
        }

        // 4. Migrate Requests
        if (jsonData.requests && jsonData.requests.length > 0) {
            for (const req of jsonData.requests) {
                const [existing] = await connection.query("SELECT * FROM requests WHERE id = ?", [req.id]);
                if (existing.length === 0) {
                    await connection.query(
                        "INSERT INTO requests (id, name, email, phone, service, subject, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        [req.id, req.name, req.email, req.phone, req.service, req.subject, req.message, new Date(req.created_at || Date.now())]
                    );
                    console.log(`   - Request from '${req.name}' migrated to cloud.`);
                }
            }
        }

        // 5. Migrate Settings
        if (jsonData.settings) {
            await connection.query(
                "INSERT INTO settings (id, announcement, show_announcement) VALUES (1, ?, ?) ON DUPLICATE KEY UPDATE announcement = ?, show_announcement = ?",
                [jsonData.settings.announcement, jsonData.settings.showAnnouncement, jsonData.settings.announcement, jsonData.settings.showAnnouncement]
            );
            console.log("   - Cloud settings migrated.");
        }

        console.log("🎉 Cloud Migration Successful!");

    } catch (err) {
        console.error("❌ Cloud Migration failed:", err.message);
    } finally {
        await connection.end();
    }
}

migrate();
