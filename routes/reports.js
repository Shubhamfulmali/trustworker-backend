const express = require("express");
const router = express.Router();
const db = require("../db");
const { body, param } = require("express-validator");
const { handleValidation } = require("../utils/validators");
const { requireApiKey } = require("../middleware/auth");

// This router is mounted at /api/reports (admin-only views).
// The public "submit a report" endpoint lives at POST /api/workers/:id/report
// inside routes/workers.js since it needs to be nested under /api/workers.

// GET /api/reports  (protected — admin only, view all open reports)
router.get("/", requireApiKey, (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.*, w.name AS worker_name, w.phone AS worker_phone
       FROM reports r JOIN workers w ON w.id = r.worker_id
       ORDER BY r.created_at DESC`
    )
    .all();
  res.json({ success: true, data: rows });
});

// PUT /api/reports/:id  (protected — admin marks report reviewed/dismissed)
router.put(
  "/:id",
  requireApiKey,
  [param("id").isInt({ min: 1 }), body("status").isIn(["open", "reviewed", "dismissed"])],
  handleValidation,
  (req, res) => {
    const existing = db.prepare("SELECT id FROM reports WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: "Report not found" });

    db.prepare("UPDATE reports SET status = ? WHERE id = ?").run(req.body.status, req.params.id);
    res.json({ success: true, message: "Report updated" });
  }
);

module.exports = router;
