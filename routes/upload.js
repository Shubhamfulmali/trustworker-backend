const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { requireApiKey } = require("../middleware/auth");

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const random = crypto.randomBytes(12).toString("hex");
    cb(null, `${Date.now()}-${random}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return cb(new Error("Only JPG, PNG, or WEBP images are allowed"));
    }
    cb(null, true);
  },
});

// POST /api/upload  (protected — admin/Android app only)
// multipart/form-data, field name: "photo"
router.post("/", requireApiKey, (req, res) => {
  upload.single("photo")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded (field name must be 'photo')" });
    }
    const publicUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
    res.status(201).json({ success: true, data: { url: publicUrl } });
  });
});

module.exports = router;
