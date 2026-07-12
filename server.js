require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const path = require("path");
const workersRouter = require("./routes/workers");
const uploadRouter = require("./routes/upload");
const devicesRouter = require("./routes/devices");
const reportsRouter = require("./routes/reports");
const bookingsRouter = require("./routes/bookings");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors()); // Android app / any client can call this API
app.use(express.json({ limit: "1mb" }));
app.use(morgan("tiny"));

// Very basic in-memory rate limiter (no extra dependency needed)
const requestLog = new Map();
app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 120;

  const entry = requestLog.get(ip) || { count: 0, start: now };
  if (now - entry.start > windowMs) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count += 1;
  requestLog.set(ip, entry);

  if (entry.count > maxRequests) {
    return res.status(429).json({ success: false, message: "Too many requests, slow down." });
  }
  next();
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "TrustWorker API is running",
    endpoints: {
      list_workers: "GET /api/workers",
      nearby_workers: "GET /api/workers/nearby?lat=&lng=&radius_km=",
      get_worker: "GET /api/workers/:id",
      categories: "GET /api/workers/categories",
      add_worker: "POST /api/workers  (requires x-api-key)",
      suggest_worker: "POST /api/workers/suggest  (public, goes pending approval)",
      approve_worker: "PUT /api/workers/:id/approve  (requires x-api-key)",
      update_worker: "PUT /api/workers/:id  (requires x-api-key)",
      delete_worker: "DELETE /api/workers/:id  (requires x-api-key)",
      add_review: "POST /api/workers/:id/reviews",
      report_worker: "POST /api/workers/:id/report",
      list_reports: "GET /api/reports  (requires x-api-key)",
      claim_listing: "POST /api/workers/:id/claim  (requires Firebase Bearer token)",
      self_update: "PUT /api/workers/:id/self-update  (requires Firebase Bearer token)",
      bookings_create: "POST /api/workers/:id/bookings",
      bookings_list: "GET /api/workers/:id/bookings  (requires x-api-key)",
      booking_update: "PUT /api/bookings/:id  (requires x-api-key)",
      upload_photo: "POST /api/upload  (multipart 'photo', requires x-api-key)",
      register_device: "POST /api/devices/register  (for push notifications)",
    },
  });
});

app.use("/api/workers", workersRouter);
app.use("/api", bookingsRouter); // provides /api/workers/:id/bookings and /api/bookings/:id
app.use("/api/reports", reportsRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/devices", devicesRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
