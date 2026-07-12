# TrustWorker — Backend API

Node.js + Express + SQLite backend for the TrustWorker local service directory app.
Your Android app (UI) can call this API directly over HTTP/JSON. Data is saved
permanently in a real SQLite database file (`data/app.db`) — not localStorage,
not in-memory — so it survives server restarts and works for every user of
your Android app at once.

---

## 1. Setup (run locally)

```bash
cd backend
npm install
cp .env.example .env      # then edit .env and set your own ADMIN_API_KEY
npm start
```

Server starts at: `http://localhost:3000`

Test it:
```bash
curl http://localhost:3000/api/workers
```

## 2. Project structure

```
backend/
  server.js            -> app entry point, middleware, routes mounted here
  db.js                -> SQLite connection + schema + seed data
  routes/workers.js     -> all worker + review endpoints (CRUD)
  middleware/auth.js    -> x-api-key protection for write actions
  utils/validators.js   -> input validation rules (express-validator)
  data/app.db           -> the actual database file (auto-created)
  .env                  -> your secrets (PORT, ADMIN_API_KEY) - not committed
```

## 3. Database

Uses **SQLite** via `better-sqlite3` (fast, file-based, zero external
DB server needed). Two tables:

**workers**
| column | type | notes |
|---|---|---|
| id | integer | auto id |
| name | text | required |
| service | text | required, e.g. "Plumber" |
| phone | text | required |
| city | text | optional |
| note | text | optional |
| photo_url | text | optional, profile photo link |
| verified | boolean | admin-verified badge |
| available | boolean | currently taking work or not |
| rating_avg | real | auto-calculated from reviews |
| rating_count | integer | auto-calculated |
| created_at / updated_at | text | timestamps |

**reviews**
| column | type | notes |
|---|---|---|
| id | integer | auto id |
| worker_id | integer | FK -> workers.id |
| reviewer_name | text | optional |
| rating | integer | 1-5, required |
| comment | text | optional |
| created_at | text | timestamp |

If you ever want to reset all data, just stop the server and delete the
`data/app.db` file — it will regenerate with seed data on next start.

## 4. Authentication (for Android write requests)

✅ **Firebase is already set up and tested for this project** (project: `trustworker-6f3b2`, Android package: `com.trustworker.app`). I verified the service account credentials initialize correctly against the real Firebase project.

For security, I did **not** keep a copy of your service account key or its base64 value — you'll need to convert your downloaded JSON file yourself and put it in your own `.env`. This only takes one command:

**On Windows (PowerShell):**
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("trustworker-6f3b2-firebase-adminsdk-xxxxx.json")) | Set-Clipboard
```
(this copies the result to your clipboard — just paste it into `.env`)

**On macOS/Linux:**
```bash
base64 -w0 trustworker-6f3b2-firebase-adminsdk-xxxxx.json
```

Paste the output into `.env` as a single line:
```
FIREBASE_SERVICE_ACCOUNT_BASE64=<paste the long string here>
```

⚠️ **Keep that JSON file and the base64 value private** — never commit them to GitHub or share them publicly. Anyone with that file has admin access to your Firebase project.

Read endpoints (`GET`) are public — anyone can browse the directory.
Write endpoints (`POST /api/workers`, `PUT`, `DELETE`) require this header:

```
x-api-key: <your ADMIN_API_KEY from .env>
```

This is meant for an **admin-only "add/edit/delete worker" screen** in your
Android app (e.g. only you or approved staff can add workers). Reviews from
regular users don't need the key — anyone can submit a review.

> If you want *every* logged-in user to be able to add workers (not just
> admin), tell me and I'll swap this for proper per-user login + JWT tokens.

## 5. New features added

| Feature | How it works |
|---|---|
| 📍 Nearby search | `GET /api/workers/nearby?lat=&lng=&radius_km=` — Android sends the phone's GPS coords (free, built into Android). Backend calculates distance itself (Haversine formula) — **no external map API needed** for this. |
| 📸 Photo upload | `POST /api/upload` (multipart, field `photo`) — saves to server disk, returns a URL you store in `photo_url`. |
| 🔔 Push notifications | `POST /api/devices/register` saves an Android FCM token + city. When a worker is added/approved in that city, a push goes out automatically via Firebase Cloud Messaging. Needs Firebase setup (see below) — free. |
| ✅ Admin approval flow | `POST /api/workers/suggest` (public, no key) — anyone can suggest a worker; it's hidden until `PUT /api/workers/:id/approve` (admin key) makes it visible. |
| 🚩 Report/complain | `POST /api/workers/:id/report` (public) + `GET /api/reports` / `PUT /api/reports/:id` (admin) to review them. |
| 📅 Bookings | `POST /api/workers/:id/bookings` (public, customer books a slot) + admin views/updates status via `GET/PUT`. |
| 🔐 Worker self-login | Worker verifies their phone via Firebase Phone Auth in the Android app, then `POST /api/workers/:id/claim` links their account. After that `PUT /api/workers/:id/self-update` lets them edit their own `note`/`available`/`photo_url` — no admin key needed. |
| 🌐 Hindi/English | Pure UI concern — handled entirely in the Android app (string resources / `strings-hi.xml`), no backend change needed. |
| 💬 WhatsApp button | No API/key needed — in Android just open a link: `https://wa.me/91XXXXXXXXXX?text=Hi,+I+found+you+on+the+app` |

## 6. API Reference

Base URL (local): `http://localhost:3000/api/workers`

### GET /api/workers
List/search/filter workers. Query params (all optional):
- `service` — exact match, e.g. `?service=Plumber`
- `city` — partial match, e.g. `?city=Noida`
- `q` — free text search across name/service/city/note
- `available` — `true` / `false`
- `page`, `limit` — pagination (default page=1, limit=20)

```bash
curl "http://localhost:3000/api/workers?service=Plumber&city=Noida"
```

### GET /api/workers/categories
Returns distinct services with counts — use this to build filter chips
dynamically instead of hardcoding them.

### GET /api/workers/:id
Single worker with its reviews.

### POST /api/workers  🔒 (needs x-api-key)
```json
{
  "name": "Ravi Kumar",
  "service": "Plumber",
  "phone": "+91 98765 43210",
  "city": "Delhi",
  "note": "Available 24x7",
  "photo_url": "https://example.com/photo.jpg"
}
```

### PUT /api/workers/:id  🔒 (needs x-api-key)
Send only the fields you want to change, e.g. `{ "available": false }`.

### DELETE /api/workers/:id  🔒 (needs x-api-key)

### POST /api/workers/:id/reviews  (public — no key needed)
```json
{ "reviewer_name": "Priya", "rating": 5, "comment": "Great work, on time" }
```
Automatically recalculates that worker's `rating_avg` and `rating_count`.

### GET /api/workers/nearby?lat=&lng=&radius_km=&service=  (public)
Distance-sorted list of approved workers within `radius_km` (default 15km).

### POST /api/workers/suggest  (public — no key, goes pending)
Same body as POST /api/workers. Stays hidden until approved.

### PUT /api/workers/:id/approve  🔒 (needs x-api-key)
Makes a suggested worker publicly visible + sends a push to that city.

### POST /api/workers/:id/report  (public)
```json
{ "reporter_name": "Priya", "reason": "Overcharged", "comment": "..." }
```

### GET /api/reports  🔒 &nbsp; PUT /api/reports/:id  🔒
Admin views/updates report status (`open` / `reviewed` / `dismissed`).

### POST /api/workers/:id/bookings  (public)
```json
{ "customer_name": "Rohit", "customer_phone": "9812312312", "service_date": "2026-07-15", "time_slot": "10-11 AM", "notes": "Leak repair" }
```

### GET /api/workers/:id/bookings  🔒 &nbsp; PUT /api/bookings/:id  🔒
Admin views bookings and updates status (`pending`/`confirmed`/`completed`/`cancelled`).

### POST /api/upload  🔒 (multipart/form-data, field name `photo`)
Returns `{ "data": { "url": "http://.../uploads/xyz.jpg" } }` — use this URL as `photo_url`.

### POST /api/devices/register  (public)
```json
{ "fcm_token": "<android-fcm-token>", "city": "Noida" }
```

### POST /api/workers/:id/claim  (needs `Authorization: Bearer <firebase-id-token>`)
Links a worker's phone-verified Firebase account to their existing listing.

### PUT /api/workers/:id/self-update  (needs `Authorization: Bearer <firebase-id-token>`)
```json
{ "note": "Now available on weekends too", "available": true }
```

All responses follow the same shape:
```json
{ "success": true, "data": ... }
{ "success": false, "message": "...", "errors": [...] }
```

## 6. Security features already built in
- Helmet (secure HTTP headers)
- CORS enabled (Android app can call it from anywhere)
- Input validation + sanitization on every field (express-validator)
- SQL injection safe — uses parameterized queries only, never string-concat SQL
- Basic rate limiting (120 requests/min per IP)
- API-key protection on all write operations
- Phone number format check, URL format check for photos

## 7. Free API keys to set up NOW (before building the Android app)

Good news — this app needs **only one** external service to be "fully" free-featured. Everything else either needs no key at all, or is only needed later.

| # | Service | Needed for | Free? | Do it now? |
|---|---|---|---|---|
| 1 | **Firebase** (one project covers 2 features) | Push notifications (Cloud Messaging) + Worker phone-login (Phone Auth) | ✅ Completely free, generous limits | **Yes — set this up now** |
| 2 | Android's own Location Services | Nearby search | ✅ Free, built into Android, no signup | Nothing to create |
| 3 | WhatsApp `wa.me` links | "Chat on WhatsApp" button | ✅ Free, no key at all | Nothing to create |
| 4 | This backend's own disk storage | Photo upload | ✅ Free (self-hosted) | Nothing to create |

**How to set up Firebase (5 minutes, free):**
1. Go to https://console.firebase.google.com → "Add project" → give it a name → free tier, no credit card needed.
2. In the project, go to **Build → Cloud Messaging** and enable it (for push notifications).
3. Go to **Build → Authentication → Sign-in method** and enable **Phone** (for worker OTP login) — Firebase sends the actual OTP SMS itself, free within normal limits.
4. Add an Android app inside the Firebase project (you'll need this anyway for the Android build) — download `google-services.json`, you'll put this in your Android project.
5. For the backend: go to **Project settings (gear icon) → Service accounts → Generate new private key** — downloads a JSON file. Run `base64 -w0 that-file.json` and paste the result into this backend's `.env` as `FIREBASE_SERVICE_ACCOUNT_BASE64`.

That's genuinely it — no Google Maps API key, no Twilio, no Cloudinary needed to have a fully working app with push notifications, location search, and worker OTP login.

**Only get these later, and only if you want them:**
- **Google Maps SDK for Android** (`console.cloud.google.com`) — only if you want an actual map view showing pins, not just a list. Has a free monthly credit that covers small apps, but needs a billing card on file. Skip this if a plain list + distance is enough — it usually is.
- **Cloudinary** (free tier, cloudinary.com) — only if you deploy to a free host with an ephemeral filesystem (see note below) and photos keep disappearing after redeploys.

## 8. Deploying so your Android app can reach it over the internet

Right now this only runs on your own machine (`localhost`). For the Android
app to talk to it from any phone/network, deploy it to a free host, e.g.:

- **Render.com** (free tier): connect your GitHub repo → "New Web Service" →
  build command `npm install`, start command `npm start` → add `ADMIN_API_KEY`
  as an environment variable in their dashboard.
- **Railway.app**: similar one-click deploy from GitHub.
- **Fly.io** or a small **VPS** if you want more control.

⚠️ One important note about SQLite on free hosts: some free tiers (like
Render's free web service) use an *ephemeral filesystem* — meaning
`data/app.db` can get wiped on redeploys/restarts. For a production app,
once you're ready to launch for real users, I'd recommend moving to a
managed database like **PostgreSQL** (Render/Railway/Neon all offer a free
Postgres instance). I can convert this backend from SQLite to PostgreSQL
in a few minutes whenever you're ready — the API endpoints and Android code
won't need to change at all.

## 9. Example: calling this from Android (Kotlin/Retrofit)

```kotlin
interface WorkerApi {
    @GET("api/workers")
    suspend fun getWorkers(
        @Query("service") service: String? = null,
        @Query("q") q: String? = null
    ): WorkerListResponse

    @POST("api/workers")
    suspend fun addWorker(
        @Header("x-api-key") apiKey: String,
        @Body worker: NewWorkerRequest
    ): WorkerResponse
}
```
Base URL once deployed: `https://your-app-name.onrender.com/`
