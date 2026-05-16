const { ImageKit, toFile } = require('@imagekit/nodejs');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const hasImageKitConfig = () => !!(
    process.env.IMAGEKIT_PUBLIC_KEY &&
    process.env.IMAGEKIT_PRIVATE_KEY &&
    process.env.IMAGEKIT_URL_ENDPOINT
);

const createImageKitClient = () => new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

// Configure Multer for disk storage (stable RAM usage)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'temp-' + uniqueSuffix + path.extname(file.originalname));
    }
});

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
    limits: { fileSize: 50 * 1024 * 1024 }, // Increased to 50MB since it's now RAM-safe
    fileFilter: fileFilter
});

/**
 * Uploads a file from disk to ImageKit or moves it to final local storage.
 */
const uploadToImageKit = async (file, req = null) => {
    if (!file || !file.path) return null;

    if (!hasImageKitConfig()) {
        // Local fallback: Rename the temp file to a permanent name
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filename = `goddygraphix-${Date.now()}-${safeName}`;
        const finalPath = path.join(UPLOAD_DIR, filename);
        
        try {
            fs.renameSync(file.path, finalPath);
        } catch (err) {
            console.error("[UPLOADS] Local rename failed, trying copy:", err);
            fs.copyFileSync(file.path, finalPath);
            fs.unlinkSync(file.path);
        }

        const configuredBaseUrl = process.env.PUBLIC_BASE_URL ||
            process.env.BACKEND_URL ||
            process.env.RENDER_EXTERNAL_URL;
        const requestBaseUrl = req ? `${req.protocol}://${req.get('host')}` : '';
        const baseUrl = (configuredBaseUrl || requestBaseUrl).replace(/\/$/, '');

        return baseUrl ? `${baseUrl}/uploads/${filename}` : `/uploads/${filename}`;
    }

    try {
        const imagekit = createImageKitClient();
        const fileName = `goddygraphix-${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        console.log(`[IMAGEKIT] Uploading file from disk: ${file.originalname} (${file.size} bytes)`);
        
        // Upload using a ReadStream (Hardened: very low RAM usage)
        const response = await imagekit.files.upload({
            file: fs.createReadStream(file.path),
            fileName: fileName,
            folder: "/goddygraphix_uploads"
        });
        
        // Cleanup: Delete the temp file after successful upload
        try {
            fs.unlinkSync(file.path);
        } catch (e) {
            console.warn("[IMAGEKIT] Cleanup warning:", e.message);
        }

        return response.url;
    } catch (error) {
        // Cleanup even on failure
        if (file.path && fs.existsSync(file.path)) {
            try { fs.unlinkSync(file.path); } catch (e) {}
        }
        console.error("[IMAGEKIT] Upload Error:", error.message || error);
        throw new Error(`ImageKit Upload Failed: ${error.message || 'Unknown error'}`);
    }
};

module.exports = { upload, uploadToImageKit };
