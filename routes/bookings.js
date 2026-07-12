const express = require("express");
const router = express.Router();
const db = require("../db");
const { body, param } = require("express-validator");
const { handleValidation } = require("../utils/validators");
const { requireApiKey } = require("../middleware/auth");

const PHONE_REGEX = /^[+]?[\d\s-]{8,16}$/;

// POST /api/workers/:id/bookings  (public — a customer books a worker)
router.post(
  "/workers/:id/bookings",
  [
    param("id").isInt({ min: 1 }),
    body("customer_name").trim().notEmpty().withMessage("customer_name is required").isLength({ max: 120 }),
    body("customer_phone").trim().matches(PHONE_REGEX).withMessage("valid customer_phone is required"),
    body("service_date").optional({ checkFalsy: true }).isISO8601().withMessage("service_date must be YYYY-MM-DD"),
    body("time_slot").optional({ checkFalsy: true }).trim().isLength({ max: 40 }),
    body("notes").optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
  ],
  handleValidation,
  (req, res) => {
    const worker = db.prepare("SELECT id FROM workers WHERE id = ?").get(req.params.id);
    if (!worker) return res.status(404).json({ success: false, message: "Worker not found" });

    const { customer_name, customer_phone, service_date = null, time_slot = null, notes = "" } = req.body;

    const info = db
      .prepare(
        `INSERT INTO bookings (worker_id, customer_name, customer_phone, service_date, time_slot, notes)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(req.params.id, customer_name, customer_phone, service_date, time_slot, notes);

    const created = db.prepare("SELECT * FROM bookings WHERE id = ?").get(info.lastInsertRowid);
    res.status(201).json({ success: true, data: created });
  }
);

// GET /api/workers/:id/bookings  (protected — admin/worker views bookings)
router.get("/workers/:id/bookings", requireApiKey, [param("id").isInt({ min: 1 })], handleValidation, (req, res) => {
  const rows = db
    .prepare("SELECT * FROM bookings WHERE worker_id = ? ORDER BY created_at DESC")
    .all(req.params.id);
  res.json({ success: true, data: rows });
});

// PUT /api/bookings/:id  (protected — update status: pending/confirmed/completed/cancelled)
router.put(
  "/bookings/:id",
  requireApiKey,
  [param("id").isInt({ min: 1 }), body("status").isIn(["pending", "confirmed", "completed", "cancelled"])],
  handleValidation,
  (req, res) => {
    const existing = db.prepare("SELECT id FROM bookings WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: "Booking not found" });

    db.prepare("UPDATE bookings SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
      req.body.status,
      req.params.id
    );
    res.json({ success: true, message: "Booking updated" });
  }
);

module.exports = router;
