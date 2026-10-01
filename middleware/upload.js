const multer = require('multer');
const path = require('path');

const storage = multer.memoryStorage();

const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const isImageMime = file.mimetype && file.mimetype.startsWith('image/');
  const isImageExt = allowedExtensions.includes(ext);

  // Accept if EITHER the mimetype looks like an image OR the extension does.
  // (Some clients, like Postman with certain files e.g. WhatsApp images,
  // send "application/octet-stream" even for real images, so we fall back
  // to checking the file extension.)
  if (isImageMime || isImageExt) {
    cb(null, true);
  } else {
    // Turned into a 400 ONLY_IMAGES by the error handler in server.js
    const err = new Error('Only image files are allowed (jpg, jpeg, png, webp, gif)');
    err.code = 'ONLY_IMAGES';
    cb(err, false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

module.exports = upload;