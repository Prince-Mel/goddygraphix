require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const nodemailer = require('nodemailer');
const axios = require('axios'); // For Telegram notifications
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pool = require('./db'); // MySQL Connection
const { upload } = require('./cloudinary'); // Cloudinary Uploads

const app = express();
const port = process.env.PORT || 3000;
const COOKIE_SECRET = process.env.COOKIE_SECRET || 'your-very-secure-random-secret-key-123';

// --- Database Initialization ---
const initDb = async () => {
    try {
        const connection = await pool.getConnection();
        
        // Users Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL
            )
        `);

        // Portfolio Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS portfolio (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                category VARCHAR(255) NOT NULL,
                description TEXT,
                image_url VARCHAR(255) NOT NULL,
                visible BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Requests Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(50),
                service VARCHAR(100),
                subject VARCHAR(255),
                message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Settings Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS settings (
                id INT PRIMARY KEY DEFAULT 1,
                announcement VARCHAR(255),
                show_announcement BOOLEAN DEFAULT TRUE
            )
        `);

        // Insert Default Admin if not exists
        const [users] = await connection.query("SELECT * FROM users WHERE username = 'goddy'");
        if (users.length === 0) {
            const hashedPassword = bcrypt.hashSync('goddy123', 10);
            await connection.query("INSERT INTO users (username, password) VALUES (?, ?)", ['goddy', hashedPassword]);
            console.log("[DB] Default admin 'goddy' created.");
        }

        // Insert Default Settings if not exists
        const [settings] = await connection.query("SELECT * FROM settings WHERE id = 1");
        if (settings.length === 0) {
            await connection.query("INSERT INTO settings (id, announcement, show_announcement) VALUES (1, 'Welcome to Goddy Graphix!', true)");
            console.log("[DB] Default settings created.");
        }

        connection.release();
        console.log("[DB] Database initialized successfully.");
    } catch (err) {
        console.error("[DB] Initialization Error:", err);
    }
};

// Initialize DB on start
initDb();

// --- Notification Helpers ---
const sendNotifications = async (request) => {
    // 1. Telegram Notification (Instant)
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
        const text = `🚀 *New Service Request!* 🚀\n\n` +
                     `👤 *Name:* ${request.name}\n` +
                     `📧 *Email:* ${request.email}\n` +
                     `📞 *Phone:* ${request.phone || 'N/A'}\n` +
                     `🛠 *Service:* ${request.service}\n\n` +
                     `📝 *Message:*\n${request.message}`;
        
        const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
        
        axios.post(url, {
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: text,
            parse_mode: 'Markdown'
        }).catch(err => console.error("[NOTIFY] Telegram Error:", err.message));
    } else {
        console.warn("[NOTIFY] Telegram credentials missing. Skipping Telegram alert.");
    }

    // 2. Email Notification (Nodemailer)
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_TO || process.env.EMAIL_USER,
            subject: `New Service Request: ${request.service}`,
            text: `You have a new request from ${request.name} (${request.email})\n\nService: ${request.service}\nMessage: ${request.message}\n\nPhone: ${request.phone || 'N/A'}`
        };

        transporter.sendMail(mailOptions).catch(err => console.error("[NOTIFY] Email Error:", err));
    }
};

// Security Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP to avoid issues with external CDNs
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser(COOKIE_SECRET)); // Use signed cookies
app.use(express.static('public'));
// app.use('/uploads', express.static('uploads')); // No longer needed with Cloudinary

// Rate Limiting
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, 
    message: { error: "Too many login attempts from this IP, please try again after 15 minutes" }
});

const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: { error: "Too many requests from this IP, please try again after an hour" }
});

// Authentication Middleware
const requireAuth = (req, res, next) => {
    const isAuthed = !!(req.signedCookies && req.signedCookies.auth === 'true');
    if (isAuthed) {
        next();
    } else {
        console.warn(`[AUTH] Unauthorized access attempt to: ${req.path}`);
        res.status(401).json({ error: 'Session expired or unauthorized. Please log in again.' });
    }
};

// --- API Endpoints ---

// Login
app.post('/api/login', loginLimiter, async (req, res) => {
    try {
        let { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        username = username.trim().toLowerCase();
        password = password.trim();

        const [users] = await pool.query("SELECT * FROM users WHERE username = ?", [username]);
        const user = users[0];
        
        if (user && bcrypt.compareSync(password, user.password)) {
            console.log(`[AUTH] Access GRANTED for ${username}`);
            res.cookie('auth', 'true', { 
                httpOnly: true, 
                signed: true, 
                sameSite: 'lax',
                maxAge: 24 * 60 * 60 * 1000 
            });
            res.json({ success: true });
        } else {
            console.warn(`[AUTH] Access DENIED for: ${username} - Invalid credentials`);
            res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (err) {
        console.error("[AUTH] Error:", err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    res.clearCookie('auth');
    res.json({ success: true });
});

// Profile Update
app.post('/api/profile', requireAuth, async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const hashedPassword = bcrypt.hashSync(password.trim(), 10);
        // Assuming we are updating the current user. For simplicity, we update 'goddy' or whoever is logged in. 
        // In a real app, you'd track the user ID in the session.
        await pool.query("UPDATE users SET password = ? WHERE username = ?", [hashedPassword, username.trim().toLowerCase()]);
        
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// Settings Endpoints
app.get('/api/settings', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT announcement, show_announcement FROM settings WHERE id = 1");
        if (rows.length > 0) {
            res.json({
                announcement: rows[0].announcement,
                showAnnouncement: !!rows[0].show_announcement // Convert 1/0 to boolean
            });
        } else {
            res.json({ announcement: "", showAnnouncement: false });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

app.post('/api/settings', requireAuth, async (req, res) => {
    try {
        const { announcement, showAnnouncement } = req.body;
        await pool.query("UPDATE settings SET announcement = ?, show_announcement = ? WHERE id = 1", [announcement, showAnnouncement]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// Get Portfolio Items
app.get('/api/portfolio', async (req, res) => {
    try {
        const isAdmin = req.signedCookies.auth === 'true';
        let query = "SELECT * FROM portfolio";
        if (!isAdmin) {
            query += " WHERE visible = TRUE";
        }
        query += " ORDER BY id DESC";

        const [items] = await pool.query(query);
        
        // Convert visible 1/0 to boolean for frontend consistency
        const formattedItems = items.map(item => ({
            ...item,
            visible: !!item.visible
        }));

        res.json(formattedItems);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// Add Portfolio Item (Protected) - Uses Cloudinary 'upload' middleware
app.post('/api/portfolio', requireAuth, upload.single('image'), async (req, res) => {
    try {
        const { title, category, description } = req.body;  
        // Cloudinary returns the URL in req.file.path
        const imageUrl = req.file ? req.file.path : '';

        if (!title || !category || !imageUrl) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const [result] = await pool.query(
            "INSERT INTO portfolio (title, category, description, image_url, visible) VALUES (?, ?, ?, ?, ?)",
            [title, category, description || "", imageUrl, true]
        );
        
        res.json({
            id: result.insertId,
            title,
            category,
            description,
            image_url: imageUrl,
            visible: true
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// Toggle Portfolio Visibility
app.patch('/api/portfolio/:id/visibility', requireAuth, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { visible } = req.body;
        await pool.query("UPDATE portfolio SET visible = ? WHERE id = ?", [visible, id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// Delete Portfolio Item
app.delete('/api/portfolio/:id', requireAuth, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        // Note: We are not automatically deleting images from Cloudinary here to keep it simple.
        // In a production app, you might want to use cloudinary.uploader.destroy(public_id).
        
        await pool.query("DELETE FROM portfolio WHERE id = ?", [id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// Submit Service Request
app.post('/api/requests', contactLimiter, async (req, res) => {
    try {
        const { name, email, phone, service, subject, message } = req.body;

        if (!name || !email || !message) {
            return res.status(400).json({ error: 'Name, email and message are required' });
        }

        const [result] = await pool.query(
            "INSERT INTO requests (name, email, phone, service, subject, message) VALUES (?, ?, ?, ?, ?, ?)",
            [name, email, phone, service || 'General Inquiry', subject || 'New Contact Request', message]
        );

        const newRequest = {
            id: result.insertId,
            name, email, phone, service, subject, message
        };
        
        // Trigger notifications
        sendNotifications(newRequest);
        
        res.json({ success: true, message: "Request sent successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// Get Service Requests
app.get('/api/requests', requireAuth, async (req, res) => {   
    try {
        const [requests] = await pool.query("SELECT * FROM requests ORDER BY id DESC");
        res.json(requests);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// Delete Service Request
app.delete('/api/requests/:id', requireAuth, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await pool.query("DELETE FROM requests WHERE id = ?", [id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// Check Auth Status
app.get('/api/auth/check', (req, res) => {
    const isAuthenticated = !!(req.signedCookies && req.signedCookies.auth === 'true');
    res.json({ authenticated: isAuthenticated });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
