const ImageKit = require('@imagekit/nodejs');
const multer = require('multer');

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
 * Uploads a file buffer to ImageKit
 * @param {Object} file - Multer file object
 * @returns {Promise<string>} - The URL of the uploaded image
 */
const uploadToImageKit = async (file) => {
    if (!file) return null;

    // Check if ImageKit is configured
    if (!process.env.IMAGEKIT_PUBLIC_KEY || !process.env.IMAGEKIT_PRIVATE_KEY || !process.env.IMAGEKIT_URL_ENDPOINT) {
        console.error("[IMAGEKIT] Error: Missing ImageKit configuration in environment variables.");
        throw new Error("ImageKit hosting is not configured on the server.");
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
