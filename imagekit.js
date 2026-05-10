const ImageKit = require('@imagekit/nodejs');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Initialize ImageKit
const imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY || '',
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY || '',
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || ''
});

// Configure Multer for memory storage (required for cloud uploads)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|pdf/;
    const isMimeOk = allowedTypes.test(file.mimetype);
    const isExtOk = allowedTypes.test(file.originalname.toLowerCase());

    if (isMimeOk && isExtOk) {
        cb(null, true);
    } else {
        cb(new Error('Only image and pdf files are allowed (jpeg, jpg, png, gif, webp, pdf)'));
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: fileFilter
});

/**
 * Uploads a file buffer to ImageKit when configured, otherwise stores it locally.
 * @param {Object} file - Multer file object
 * @param {Object} req - Express request, used to build absolute local file URLs
 * @returns {Promise<string>} - The URL of the uploaded image
 */
const uploadToImageKit = async (file, req = null) => {
    if (!file) return null;

    const hasImageKitConfig = process.env.IMAGEKIT_PUBLIC_KEY &&
        process.env.IMAGEKIT_PRIVATE_KEY &&
        process.env.IMAGEKIT_URL_ENDPOINT;

    if (!hasImageKitConfig) {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filename = `goddygraphix-${Date.now()}-${safeName}`;
        const filePath = path.join(UPLOAD_DIR, filename);
        fs.writeFileSync(filePath, file.buffer);

        const configuredBaseUrl = process.env.PUBLIC_BASE_URL ||
            process.env.BACKEND_URL ||
            process.env.RENDER_EXTERNAL_URL;
        const requestBaseUrl = req ? `${req.protocol}://${req.get('host')}` : '';
        const baseUrl = (configuredBaseUrl || requestBaseUrl).replace(/\/$/, '');

        if (!baseUrl) {
            return `/uploads/${filename}`;
        }

        console.log(`[UPLOADS] Saved locally: /uploads/${filename}`);
        return `${baseUrl}/uploads/${filename}`;
    }

    try {
        console.log(`[IMAGEKIT] Uploading file: ${file.originalname} (${file.size} bytes)`);
        const response = await imagekit.upload({
            file: file.buffer, // required
            fileName: `goddygraphix-${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`, // required
            folder: "/goddygraphix_uploads"
        });
        console.log("[IMAGEKIT] Upload successful:", response.url);
        return response.url;
    } catch (error) {
        console.error("[IMAGEKIT] Upload Error:", error.message || error);
        if (error.message && error.message.includes('Authentication failed')) {
            throw new Error("ImageKit authentication failed. Please check your keys.");
        }
        throw new Error(`ImageKit Upload Failed: ${error.message || 'Unknown error'}`);
    }
};

module.exports = { upload, uploadToImageKit };
