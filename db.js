const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DB_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, "app.db");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ---------- Schema ----------
db.exec(`
CREATE TABLE IF NOT EXISTS workers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  service       TEXT NOT NULL,
  phone         TEXT NOT NULL,
  city          TEXT,
  note          TEXT,
  photo_url     TEXT,
  lat           REAL,
  lng           REAL,
  verified      INTEGER NOT NULL DEFAULT 0,
  available     INTEGER NOT NULL DEFAULT 1,
  is_approved   INTEGER NOT NULL DEFAULT 1,
  firebase_uid  TEXT UNIQUE,
  rating_avg    REAL NOT NULL DEFAULT 0,
  rating_count  INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id     INTEGER NOT NULL,
  reviewer_name TEXT,
  rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id     INTEGER NOT NULL,
  reporter_name TEXT,
  reason        TEXT NOT NULL,
  comment       TEXT,
  status        TEXT NOT NULL DEFAULT 'open',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bookings (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id      INTEGER NOT NULL,
  customer_name  TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  service_date   TEXT,
  time_slot      TEXT,
  notes          TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS devices (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  fcm_token   TEXT NOT NULL UNIQUE,
  city        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workers_service ON workers(service);
CREATE INDEX IF NOT EXISTS idx_workers_city ON workers(city);
CREATE INDEX IF NOT EXISTS idx_reviews_worker ON reviews(worker_id);
CREATE INDEX IF NOT EXISTS idx_reports_worker ON reports(worker_id);
CREATE INDEX IF NOT EXISTS idx_bookings_worker ON bookings(worker_id);
CREATE INDEX IF NOT EXISTS idx_devices_city ON devices(city);
`);

// ---------- Seed (only if table empty) ----------
const count = db.prepare("SELECT COUNT(*) AS c FROM workers").get().c;
if (count === 0) {
  const insert = db.prepare(`
    INSERT INTO workers (name, service, phone, city, note, verified, available)
    VALUES (@name, @service, @phone, @city, @note, @verified, @available)
  `);
  const seedData = [
    { name: "Rakesh Plumbing", service: "Plumber", phone: "+919876543210", city: "Noida", note: "Leak repair, bathroom fittings, 24x7 service", verified: 1, available: 1 },
    { name: "Suresh Gas Care", service: "Gas Repair", phone: "+919123456789", city: "Gurgaon", note: "Gas stove, cylinder connection, pipeline leak check", verified: 1, available: 1 },
    { name: "Amit Electric", service: "Electrician", phone: "+919988766554", city: "Delhi", note: "Light fitting, fan repair, wiring and switchboard", verified: 0, available: 1 },
    { name: "Neha Home Fix", service: "Carpenter", phone: "+919012345678", city: "Faridabad", note: "Woodwork, door repair, custom shelves", verified: 0, available: 1 },
    { name: "Deepak Painter", service: "Painter", phone: "+919345678901", city: "Ghaziabad", note: "Interior and exterior painting, texture finish", verified: 1, available: 0 },
  ];
  const insertMany = db.transaction((rows) => {
    for (const row of rows) insert.run(row);
  });
  insertMany(seedData);
}

module.exports = db;
