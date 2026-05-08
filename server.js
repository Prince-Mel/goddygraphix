require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const nodemailer = require('nodemailer');
const axios = require('axios'); // For Telegram & Python email notifications
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { spawn } = require('child_process'); // For Python email automation
const pool = require('./db'); // MySQL Connection
const { upload, uploadToImageKit } = require('./imagekit'); // ImageKit Hosting
const cors = require('cors');

const app = express();

// --- Configuration & Constants ---
const port = process.env.PORT || 3000;
const COOKIE_SECRET = process.env.COOKIE_SECRET || 'your-very-secure-random-secret-key-123';

// EmailJS Configuration
const EMAILJS_CONFIG = {
    publicKey: process.env.EMAILJS_PUBLIC_KEY,
    serviceId: process.env.EMAILJS_SERVICE_ID,
    businessTemplateId: process.env.EMAILJS_BUSINESS_TEMPLATE_ID,
    customerTemplateId: process.env.EMAILJS_CUSTOMER_TEMPLATE_ID,
    businessmanEmail: process.env.BUSINESSMAN_EMAIL || 'laryeamel06@gmail.com',
    apiUrl: "https://api.emailjs.com/api/v1.0/email/send"
};

// Serve uploaded files statically
app.use('/uploads', express.static('uploads'));

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

        // Services Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS services (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                long_description TEXT,
                price_type ENUM('fixed', 'range') DEFAULT 'range',
                price_min DECIMAL(10, 2),
                price_max DECIMAL(10, 2),
                image_url VARCHAR(500),
                visible BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Testimonials Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS testimonials (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                service VARCHAR(100),
                file_url VARCHAR(255),
                is_pdf BOOLEAN DEFAULT FALSE,
                approved BOOLEAN DEFAULT FALSE,
                visible BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

        // Seed Default Services if table is empty
        const [existingServices] = await connection.query("SELECT id FROM services LIMIT 1");
        if (existingServices.length === 0) {
            const defaultServices = [
                ['Brand Identity', 'Logos, brand guidelines, and visual identity systems that make your business stand out.', 'We craft unique brand identities that resonate with your target audience. Our process includes research, concept development, and refinement to ensure your brand communicates effectively across all touchpoints.', 50, 500, 'brand-icon.png'],
                ['Digital Design', 'Social media graphics, web banners, and digital marketing materials.', 'From social media campaigns to display advertising, we design eye-catching digital assets that drive engagement and conversions. Every piece is optimized for its platform while maintaining brand consistency.', 30, 300, 'digital-icon.png'],
                ['Print Design', 'Business cards, broch flyers, posters, and all your printed collateral needs.', 'Our print design services cover everything from business cards to large-format prints. We ensure print-ready files with proper color profiles, bleeds, and specifications for professional results.', 20, 200, 'print-icon.png'],
                ['Motion Graphics', 'Animated logos, explainer videos, and dynamic visual content.', 'Bring your ideas to life with professional motion design. Whether it is a short social media animation or a full explainer video, we create engaging motion content that captures attention.', 100, 800, 'motion-icon.png'],
                ['E-commerce', 'Complete online store design with product listings and payment integration.', 'We build beautiful, functional e-commerce stores with secure payment gateways, inventory management, and optimized checkout flows designed to maximize conversions and customer satisfaction.', 200, 2000, 'ecommerce-icon.png'],
                ['Illustration', 'Custom illustrations, infographics, and hand-drawn visual elements.', 'Our illustration services deliver unique artwork tailored to your project. From editorial illustrations to technical infographics, we create visuals that communicate complex ideas simply and beautifully.', 40, 400, 'illustration-icon.png']
            ];

            for (const svc of defaultServices) {
                await connection.query(
                    "INSERT INTO services (name, description, long_description, price_min, price_max, image_url, visible, price_type) VALUES (?, ?, ?, ?, ?, ?, TRUE, 'range')",
                    svc
                );
            }
            console.log("[DB] 6 default services seeded.");
        }

        try {
            await connection.query("ALTER TABLE requests MODIFY id INT AUTO_INCREMENT");
            await connection.query("ALTER TABLE testimonials MODIFY id INT AUTO_INCREMENT");
            await connection.query("ALTER TABLE services MODIFY id INT AUTO_INCREMENT");
            await connection.query("ALTER TABLE users MODIFY id INT AUTO_INCREMENT");
            await connection.query("ALTER TABLE portfolio MODIFY id INT AUTO_INCREMENT");
        } catch(e) { console.log("[DB] Alter tables ignored:", e.message); }

        connection.release();
        console.log("[DB] Database initialized successfully.");
    } catch (err) {
        console.error("[DB] Initialization Error:", err);
    }
};

// Initialize DB on start
initDb();

// --- Notification Helpers ---

// EmailJS REST API Helper (Replaces Python script)
const sendEmailJS = async (templateId, templateParams) => {
    try {
        const payload = {
            service_id: EMAILJS_CONFIG.serviceId,
            template_id: templateId,
            user_id: EMAILJS_CONFIG.publicKey,
            template_params: templateParams,
        };

        const response = await axios.post(EMAILJS_CONFIG.apiUrl, payload, {
            headers: { "Content-Type": "application/json" }
        });
        return { success: true, status: response.status, data: response.data };
    } catch (err) {
        console.error(`[EMAILJS ERROR] Template ${templateId}:`, err.response?.data || err.message);
        return { success: false, error: err.message };
    }
};

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
    }

    // 2. Email Notification (Nodemailer - Direct)
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

    // 3. EmailJS Automation (Node.js Implementation)
    // Send to Businessman
    sendEmailJS(EMAILJS_CONFIG.businessTemplateId, {
        to_email: EMAILJS_CONFIG.businessmanEmail,
        name: request.name,
        email: request.email,
        phone: request.phone || 'N/A',
        service: request.service,
        subject: request.subject || 'New Contact Request',
        message: request.message,
        date: request.created_at || new Date().toISOString()
    });

    // Send Auto-reply to Customer
    sendEmailJS(EMAILJS_CONFIG.customerTemplateId, {
        to_email: request.email,
        to_name: request.name,
        subject: `Re: ${request.subject || 'Your Inquiry'}`,
        message: `Dear ${request.name},\n\nThank you for contacting Goddy Graphix! We have received your inquiry regarding "${request.service}" and will get back to you shortly.\n\nBest regards,\nGoddy Graphix Team`
    });
};

// Security Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP to avoid issues with external CDNs
}));
// CORS Configuration for Vercel Frontend
app.use(cors({
    origin: function (origin, callback) {
        callback(null, true);
    }, 
    credentials: true
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

// Add Portfolio Item (Protected) - Uses local file upload
app.post('/api/portfolio', requireAuth, upload.single('image'), async (req, res) => {
    try {
        const { title, category, description } = req.body;
        // Upload to ImageKit
        const imageUrl = req.file ? await uploadToImageKit(req.file) : '';

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
        await pool.query("DELETE FROM portfolio WHERE id = ?", [id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// --- Services Endpoints ---

// Get Services (public sees visible only, admin sees all)
app.get('/api/services', async (req, res) => {
    try {
        const isAdmin = req.signedCookies && req.signedCookies.auth === 'true';
        let query = "SELECT * FROM services";
        if (!isAdmin) {
            query += " WHERE visible = TRUE";
        }
        query += " ORDER BY id ASC";

        const [rows] = await pool.query(query);
        const formatted = rows.map(row => ({
            ...row,
            visible: !!row.visible,
            price_min: row.price_min ? parseFloat(row.price_min) : null,
            price_max: row.price_max ? parseFloat(row.price_max) : null,
            image_url: row.image_url && row.image_url.startsWith('http') ? row.image_url : '',
            raw_image_url: row.image_url // Debugging field
        }));
        res.json(formatted);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// Add Service (Protected, with local file upload)
app.post('/api/services', requireAuth, upload.single('image'), async (req, res) => {
    try {
        const { name, description, long_description, price_type, price_min, price_max, visible } = req.body;
        const imageUrl = req.file ? await uploadToImageKit(req.file) : '';

        if (!name || !description) {
            return res.status(400).json({ error: 'Name and description are required' });
        }

        const [result] = await pool.query(
            "INSERT INTO services (name, description, long_description, price_type, price_min, price_max, image_url, visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [name, description, long_description || '', price_type || 'range', price_min || null, price_max || null, imageUrl, String(visible) === 'true']
        );

        res.json({
            id: result.insertId,
            name, description, long_description, price_type,
            price_min: price_min ? parseFloat(price_min) : null,
            price_max: price_max ? parseFloat(price_max) : null,
            image_url: imageUrl,
            visible: String(visible) === 'true'
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// Update Service (Protected)
app.put('/api/services/:id', requireAuth, upload.single('image'), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { name, description, long_description, price_type, price_min, price_max, visible } = req.body;
        const imageUrl = req.file ? await uploadToImageKit(req.file) : null;

        if (!name || !description) {
            return res.status(400).json({ error: 'Name and description are required' });
        }

        let query = "UPDATE services SET name = ?, description = ?, long_description = ?, price_type = ?, price_min = ?, price_max = ?, visible = ?";
        let params = [name, description, long_description || '', price_type || 'range', price_min || null, price_max || null, String(visible) === 'true'];

        if (imageUrl) {
            query += ", image_url = ?";
            params.push(imageUrl);
        }
        query += " WHERE id = ?";
        params.push(id);

        await pool.query(query, params);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// Toggle Service Visibility
app.patch('/api/services/:id/visibility', requireAuth, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { visible } = req.body;
        await pool.query("UPDATE services SET visible = ? WHERE id = ?", [visible, id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// Delete Service
app.delete('/api/services/:id', requireAuth, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await pool.query("DELETE FROM services WHERE id = ?", [id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// --- Testimonials Endpoints ---

app.get('/api/testimonials', async (req, res) => {
    try {
        const isAdmin = req.signedCookies && req.signedCookies.auth === 'true';
        let query = "SELECT * FROM testimonials";
        if (!isAdmin) {
            query += " WHERE approved = TRUE AND visible = TRUE";
        }
        query += " ORDER BY id DESC";

        const [rows] = await pool.query(query);
        const formatted = rows.map(row => ({
            ...row,
            approved: !!row.approved,
            visible: !!row.visible,
            is_pdf: !!row.is_pdf
        }));
        res.json(formatted);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

app.post('/api/testimonials', upload.single('project_file'), contactLimiter, async (req, res) => {
    try {
        const { name, message, service } = req.body;
        
        if (!name || !message) {
            return res.status(400).json({ error: 'Name and message are required' });
        }

        let fileUrl = '';
        let isPdf = false;
        
        if (req.file) {
            fileUrl = await uploadToImageKit(req.file);
            isPdf = req.file.mimetype === 'application/pdf';
        }

        const [result] = await pool.query(
            "INSERT INTO testimonials (name, message, service, file_url, is_pdf, approved, visible) VALUES (?, ?, ?, ?, ?, FALSE, TRUE)",
            [name, message, service || 'General Service', fileUrl, isPdf]
        );

        res.json({ success: true, message: "Testimony submitted successfully and is awaiting review.", id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

app.put('/api/testimonials/:id', requireAuth, upload.single('project_file'), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { name, message, service, approved, visible } = req.body;
        
        if (!name || !message) {
            return res.status(400).json({ error: 'Name and message are required' });
        }

        let query = "UPDATE testimonials SET name = ?, message = ?, service = ?, approved = ?, visible = ?";
        let params = [name, message, service || '', String(approved) === 'true', String(visible) === 'true'];

        if (req.file) {
            query += ", file_url = ?, is_pdf = ?";
            const uploadedUrl = await uploadToImageKit(req.file);
            params.push(uploadedUrl, req.file.mimetype === 'application/pdf');
        }

        query += " WHERE id = ?";
        params.push(id);

        await pool.query(query, params);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

app.delete('/api/testimonials/:id', requireAuth, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await pool.query("DELETE FROM testimonials WHERE id = ?", [id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

app.patch('/api/testimonials/:id', requireAuth, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const updates = [];
        const params = [];

        if (req.body.approved !== undefined) {
            updates.push('approved = ?');
            params.push(String(req.body.approved) === 'true');
        }
        if (req.body.visible !== undefined) {
            updates.push('visible = ?');
            params.push(String(req.body.visible) === 'true');
        }
        if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

        params.push(id);
        await pool.query(`UPDATE testimonials SET ${updates.join(', ')} WHERE id = ?`, params);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// --- Service Requests Endpoints ---

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
        res.status(500).json({ error: err.message, stack: err.stack });
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

// --- Fix DB endpoint (debug) ---
app.get('/api/fix-db', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM requests');
        
        // Truncate table completely to wipe all invalid data and reset auto_increment state
        await pool.query('TRUNCATE TABLE requests');
        
        // Try altering again
        await pool.query('ALTER TABLE requests MODIFY id INT AUTO_INCREMENT');

        res.json({ success: true, message: 'Requests table repaired!', data: rows });
    } catch (e) {
        res.json({ error: e.message });
    }
});

// --- Migration status endpoint (debug) ---
app.get('/api/migration-status', async (req, res) => {
  try {
    const tables = ['users','portfolio','services','testimonials','requests','announcements','registration_requests','materials','assessments','results','enrollments','activity_log','courses'];
    const placeholders = tables.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN (${placeholders})`,
      tables
    );
    const existing = rows.map(r => r.TABLE_NAME || r.table_name);
    const status = tables.reduce((acc, tbl) => {
      acc[tbl] = existing.includes(tbl);
      return acc;
    }, {});
    res.json({ migrationComplete: Object.values(status).every(v => v), tables: status });
  } catch (err) {
    console.error('[Migration Status] error:', err);
    res.status(500).json({ error: err.message });
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
