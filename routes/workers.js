const express = require("express");
const router = express.Router();
const db = require("../db");
const { body, param, query } = require("express-validator");
const { requireApiKey } = require("../middleware/auth");
const { verifyFirebaseToken, sendPushToTokens } = require("../lib/firebase");
const {
  handleValidation,
  workerCreateRules,
  workerUpdateRules,
  idParamRule,
  reviewCreateRules,
  listQueryRules,
} = require("../utils/validators");

// Notify devices registered in a given city about a newly available worker.
function notifyCity(city, title, body) {
  if (!city) return;
  const tokens = db
    .prepare("SELECT fcm_token FROM devices WHERE city = ? COLLATE NOCASE")
    .all(city)
    .map((r) => r.fcm_token);
  if (tokens.length) sendPushToTokens(tokens, title, body);
}

function toWorkerJson(row) {
  return {
    id: row.id,
    name: row.name,
    service: row.service,
    phone: row.phone,
    city: row.city,
    note: row.note,
    photo_url: row.photo_url,
    lat: row.lat,
    lng: row.lng,
    verified: !!row.verified,
    available: !!row.available,
    is_approved: !!row.is_approved,
    rating_avg: row.rating_avg,
    rating_count: row.rating_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Haversine distance in km between two lat/lng points
function distanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------- GET /api/workers  (list, search, filter, pagination) ----------
router.get("/", listQueryRules, handleValidation, (req, res) => {
  const { service, city, q, available, page = 1, limit = 20 } = req.query;

  const wantsPending = req.query.include_pending === "true";
  const configuredKey = process.env.ADMIN_API_KEY;
  const hasValidKey = configuredKey && req.header("x-api-key") === configuredKey;

  let sql = "SELECT * FROM workers WHERE 1=1";
  const params = {};

  // By default only approved workers are shown publicly. Pass a valid
  // x-api-key together with ?include_pending=true to see pending ones too.
  if (!(wantsPending && hasValidKey)) {
    sql += " AND is_approved = 1";
  }

  if (service) {
    sql += " AND service = @service COLLATE NOCASE";
    params.service = service;
  }
  if (city) {
    sql += " AND city LIKE @city COLLATE NOCASE";
    params.city = `%${city}%`;
  }
  if (typeof available !== "undefined") {
    sql += " AND available = @available";
    params.available = available ? 1 : 0;
  }
  if (q) {
    sql += ` AND (name LIKE @q COLLATE NOCASE OR service LIKE @q COLLATE NOCASE
             OR city LIKE @q COLLATE NOCASE OR note LIKE @q COLLATE NOCASE)`;
    params.q = `%${q}%`;
  }

  const countRow = db.prepare(`SELECT COUNT(*) AS c FROM (${sql})`).get(params);
  const total = countRow.c;

  const offset = (page - 1) * limit;
  sql += " ORDER BY created_at DESC LIMIT @limit OFFSET @offset";
  params.limit = limit;
  params.offset = offset;

  const rows = db.prepare(sql).all(params);

  res.json({
    success: true,
    data: rows.map(toWorkerJson),
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) || 1 },
  });
});

// ---------- GET /api/workers/nearby  (GPS-based, no external API needed) ----------
// Android app gets lat/lng from the phone's own Location Services (free,
// built into Android) and just sends it here. Distance is calculated with
// the Haversine formula — no Google Maps API key required for this.
router.get(
  "/nearby",
  [
    query("lat").isFloat({ min: -90, max: 90 }).withMessage("valid lat is required"),
    query("lng").isFloat({ min: -180, max: 180 }).withMessage("valid lng is required"),
    query("radius_km").optional().isFloat({ min: 0.1, max: 500 }).toFloat(),
    query("service").optional().trim().isLength({ max: 60 }),
  ],
  handleValidation,
  (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radiusKm = req.query.radius_km ? parseFloat(req.query.radius_km) : 15;

    let sql = "SELECT * FROM workers WHERE is_approved = 1 AND lat IS NOT NULL AND lng IS NOT NULL";
    const params = {};
    if (req.query.service) {
      sql += " AND service = @service COLLATE NOCASE";
      params.service = req.query.service;
    }

    const rows = db.prepare(sql).all(params);

    const withDistance = rows
      .map((row) => ({ ...toWorkerJson(row), distance_km: Math.round(distanceKm(lat, lng, row.lat, row.lng) * 10) / 10 }))
      .filter((w) => w.distance_km <= radiusKm)
      .sort((a, b) => a.distance_km - b.distance_km);

    res.json({ success: true, data: withDistance });
  }
);

// ---------- GET /api/workers/categories ----------
router.get("/categories", (req, res) => {
  const rows = db
    .prepare("SELECT service, COUNT(*) AS count FROM workers GROUP BY service ORDER BY service COLLATE NOCASE")
    .all();
  res.json({ success: true, data: rows });
});

// ---------- GET /api/workers/:id ----------
router.get("/:id", idParamRule, handleValidation, (req, res) => {
  const worker = db.prepare("SELECT * FROM workers WHERE id = ?").get(req.params.id);
  if (!worker) return res.status(404).json({ success: false, message: "Worker not found" });

  const reviews = db
    .prepare("SELECT id, reviewer_name, rating, comment, created_at FROM reviews WHERE worker_id = ? ORDER BY created_at DESC")
    .all(req.params.id);

  res.json({ success: true, data: { ...toWorkerJson(worker), reviews } });
});

// ---------- POST /api/workers  (protected) ----------
router.post("/", requireApiKey, workerCreateRules, handleValidation, (req, res) => {
  const {
    name, service, phone, city = "", note = "", photo_url = null,
    lat = null, lng = null, verified = false, available = true,
  } = req.body;

  const stmt = db.prepare(`
    INSERT INTO workers (name, service, phone, city, note, photo_url, lat, lng, verified, available, is_approved)
    VALUES (@name, @service, @phone, @city, @note, @photo_url, @lat, @lng, @verified, @available, 1)
  `);
  const info = stmt.run({
    name, service, phone, city, note, photo_url, lat, lng,
    verified: verified ? 1 : 0,
    available: available ? 1 : 0,
  });

  const created = db.prepare("SELECT * FROM workers WHERE id = ?").get(info.lastInsertRowid);
  notifyCity(city, "New helper added nearby!", `${name} (${service}) is now listed in ${city}.`);
  res.status(201).json({ success: true, data: toWorkerJson(created) });
});

// ---------- POST /api/workers/suggest  (public — no key needed, goes pending) ----------
// Lets a regular user suggest a worker for the directory. It stays hidden
// (is_approved = 0) until an admin approves it via PUT /:id/approve.
router.post("/suggest", workerCreateRules, handleValidation, (req, res) => {
  const {
    name, service, phone, city = "", note = "", photo_url = null,
    lat = null, lng = null,
  } = req.body;

  const info = db
    .prepare(`
      INSERT INTO workers (name, service, phone, city, note, photo_url, lat, lng, is_approved)
      VALUES (@name, @service, @phone, @city, @note, @photo_url, @lat, @lng, 0)
    `)
    .run({ name, service, phone, city, note, photo_url, lat, lng });

  const created = db.prepare("SELECT * FROM workers WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({
    success: true,
    message: "Thanks! Your suggestion is pending admin approval.",
    data: toWorkerJson(created),
  });
});

// ---------- PUT /api/workers/:id  (protected, partial update) ----------
router.put("/:id", requireApiKey, workerUpdateRules, handleValidation, (req, res) => {
  const existing = db.prepare("SELECT * FROM workers WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: "Worker not found" });

  const fields = ["name", "service", "phone", "city", "note", "photo_url", "lat", "lng", "verified", "available"];
  const updates = {};
  for (const f of fields) {
    if (typeof req.body[f] !== "undefined") {
      updates[f] = ["verified", "available"].includes(f) ? (req.body[f] ? 1 : 0) : req.body[f];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, message: "No fields to update" });
  }

  const setClause = Object.keys(updates)
    .map((k) => `${k} = @${k}`)
    .join(", ");

  db.prepare(`UPDATE workers SET ${setClause}, updated_at = datetime('now') WHERE id = @id`).run({
    ...updates,
    id: req.params.id,
  });

  const updated = db.prepare("SELECT * FROM workers WHERE id = ?").get(req.params.id);
  res.json({ success: true, data: toWorkerJson(updated) });
});

// ---------- DELETE /api/workers/:id  (protected) ----------
router.delete("/:id", requireApiKey, idParamRule, handleValidation, (req, res) => {
  const existing = db.prepare("SELECT * FROM workers WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: "Worker not found" });

  db.prepare("DELETE FROM workers WHERE id = ?").run(req.params.id);
  res.json({ success: true, message: "Worker deleted" });
});

// ---------- POST /api/workers/:id/reviews ----------
router.post("/:id/reviews", reviewCreateRules, handleValidation, (req, res) => {
  const worker = db.prepare("SELECT * FROM workers WHERE id = ?").get(req.params.id);
  if (!worker) return res.status(404).json({ success: false, message: "Worker not found" });

  const { reviewer_name = "Anonymous", rating, comment = "" } = req.body;

  const insertReview = db.prepare(`
    INSERT INTO reviews (worker_id, reviewer_name, rating, comment)
    VALUES (@worker_id, @reviewer_name, @rating, @comment)
  `);

  const tx = db.transaction(() => {
    insertReview.run({ worker_id: req.params.id, reviewer_name, rating, comment });

    const stats = db
      .prepare("SELECT AVG(rating) AS avg, COUNT(*) AS count FROM reviews WHERE worker_id = ?")
      .get(req.params.id);

    db.prepare("UPDATE workers SET rating_avg = ?, rating_count = ?, updated_at = datetime('now') WHERE id = ?").run(
      Math.round(stats.avg * 10) / 10,
      stats.count,
      req.params.id
    );
  });
  tx();

  const updatedWorker = db.prepare("SELECT * FROM workers WHERE id = ?").get(req.params.id);
  res.status(201).json({ success: true, data: toWorkerJson(updatedWorker) });
});

// ---------- PUT /api/workers/:id/approve  (protected — admin approves a suggestion) ----------
router.put("/:id/approve", requireApiKey, idParamRule, handleValidation, (req, res) => {
  const worker = db.prepare("SELECT * FROM workers WHERE id = ?").get(req.params.id);
  if (!worker) return res.status(404).json({ success: false, message: "Worker not found" });

  db.prepare("UPDATE workers SET is_approved = 1, updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  notifyCity(worker.city, "New helper added nearby!", `${worker.name} (${worker.service}) is now listed in ${worker.city}.`);

  res.json({ success: true, message: "Worker approved and now publicly visible" });
});

// ---------- POST /api/workers/:id/report  (public — flag a bad listing) ----------
router.post(
  "/:id/report",
  [
    param("id").isInt({ min: 1 }),
    body("reporter_name").optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
    body("reason").trim().notEmpty().withMessage("reason is required").isLength({ max: 200 }),
    body("comment").optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
  ],
  handleValidation,
  (req, res) => {
    const worker = db.prepare("SELECT id FROM workers WHERE id = ?").get(req.params.id);
    if (!worker) return res.status(404).json({ success: false, message: "Worker not found" });

    const { reporter_name = "Anonymous", reason, comment = "" } = req.body;
    db.prepare("INSERT INTO reports (worker_id, reporter_name, reason, comment) VALUES (?, ?, ?, ?)").run(
      req.params.id,
      reporter_name,
      reason,
      comment
    );

    res.status(201).json({ success: true, message: "Report submitted, thank you" });
  }
);

// ---------- POST /api/workers/:id/claim  (Firebase phone-verified worker links their listing) ----------
// Android app: worker verifies their phone number via Firebase Phone Auth,
// then sends the resulting idToken here once to "claim" their existing
// listing. After that, they can use PUT /:id/self-update without needing
// the admin key.
router.post(
  "/:id/claim",
  verifyFirebaseToken,
  idParamRule,
  handleValidation,
  (req, res) => {
    const worker = db.prepare("SELECT * FROM workers WHERE id = ?").get(req.params.id);
    if (!worker) return res.status(404).json({ success: false, message: "Worker not found" });

    if (worker.firebase_uid && worker.firebase_uid !== req.firebaseUser.uid) {
      return res.status(409).json({ success: false, message: "This listing is already claimed by someone else" });
    }

    db.prepare("UPDATE workers SET firebase_uid = ?, updated_at = datetime('now') WHERE id = ?").run(
      req.firebaseUser.uid,
      req.params.id
    );

    res.json({ success: true, message: "Listing claimed — you can now edit it yourself" });
  }
);

// ---------- PUT /api/workers/:id/self-update  (worker edits own listing, Firebase-verified) ----------
router.put(
  "/:id/self-update",
  verifyFirebaseToken,
  idParamRule,
  handleValidation,
  (req, res) => {
    const worker = db.prepare("SELECT * FROM workers WHERE id = ?").get(req.params.id);
    if (!worker) return res.status(404).json({ success: false, message: "Worker not found" });

    if (worker.firebase_uid !== req.firebaseUser.uid) {
      return res.status(403).json({ success: false, message: "You have not claimed this listing" });
    }

    // Workers can only touch these fields themselves — not verified/is_approved.
    const allowed = ["note", "available", "photo_url"];
    const updates = {};
    for (const f of allowed) {
      if (typeof req.body[f] !== "undefined") {
        updates[f] = f === "available" ? (req.body[f] ? 1 : 0) : req.body[f];
      }
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: "No editable fields provided" });
    }

    const setClause = Object.keys(updates).map((k) => `${k} = @${k}`).join(", ");
    db.prepare(`UPDATE workers SET ${setClause}, updated_at = datetime('now') WHERE id = @id`).run({
      ...updates,
      id: req.params.id,
    });

    const updated = db.prepare("SELECT * FROM workers WHERE id = ?").get(req.params.id);
    res.json({ success: true, data: toWorkerJson(updated) });
  }
);

module.exports = router;
