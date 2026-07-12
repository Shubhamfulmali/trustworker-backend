const express = require("express");
const router = express.Router();
const db = require("../db");
const { body } = require("express-validator");
const { handleValidation } = require("../utils/validators");

// POST /api/devices/register  (public — Android app calls this once it has an FCM token)
router.post(
  "/register",
  [
    body("fcm_token").trim().notEmpty().withMessage("fcm_token is required"),
    body("city").optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  ],
  handleValidation,
  (req, res) => {
    const { fcm_token, city = null } = req.body;
    db.prepare(
      `INSERT INTO devices (fcm_token, city) VALUES (?, ?)
       ON CONFLICT(fcm_token) DO UPDATE SET city = excluded.city`
    ).run(fcm_token, city);
    res.status(201).json({ success: true, message: "Device registered for notifications" });
  }
);

// DELETE /api/devices/:token  (public — call on logout / notifications-off)
router.delete("/:token", (req, res) => {
  db.prepare("DELETE FROM devices WHERE fcm_token = ?").run(req.params.token);
  res.json({ success: true, message: "Device unregistered" });
});

module.exports = router;
