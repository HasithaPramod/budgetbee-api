const cloudinary = require('../config/cloudinary');

// Multer eken enna buffer eka (memory eke thiyena image data) Cloudinary ekata upload karanawa
const uploadToCloudinary = (fileBuffer, folder = 'budgetbee/profile-pictures') => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        resolve(result); // result.secure_url, result.public_id
      }
    );
    stream.end(fileBuffer);
  });
};

// Passe image eka wenas karana welawata, pරana image eka Cloudinary eken delete karanawa
const deleteFromCloudinary = async (publicId) => {
  if (!publicId) return;
  await cloudinary.uploader.destroy(publicId);
};

module.exports = { uploadToCloudinary, deleteFromCloudinary };