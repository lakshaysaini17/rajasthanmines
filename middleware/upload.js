require('dotenv').config();
const multer = require('multer');

// Memory storage for direct in-memory processing (database base64 cloud storage or Cloudinary stream)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp|gif|svg/;
  const ext = file.originalname ? file.originalname.toLowerCase() : '';
  const mimetype = file.mimetype ? file.mimetype.toLowerCase() : '';

  if (allowed.test(mimetype) || allowed.test(ext)) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, WEBP, GIF, SVG) are allowed!'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: fileFilter
});

module.exports = upload;
