// Firebase is OPTIONAL. If you haven't set up a Firebase project yet, the
// whole app still works fine — push notifications and "worker self-login"
// simply stay switched off until you add credentials.
//
// Setup (free):
// 1. Go to https://console.firebase.google.com -> Create project (free)
// 2. Project settings -> Service accounts -> Generate new private key
//    (downloads a JSON file)
// 3. Base64-encode that file and put it in .env as FIREBASE_SERVICE_ACCOUNT_BASE64
//    e.g.  base64 -w0 serviceAccountKey.json
// 4. Enable "Cloud Messaging" (for push) and "Phone" sign-in (for worker OTP
//    login) in the Firebase console — both are free.

let admin = null;
let initialized = false;

function init() {
  if (initialized) return admin;
  initialized = true;

  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!encoded) {
    console.log("[firebase] Not configured — push notifications & worker phone-login are disabled.");
    return null;
  }

  try {
    const firebaseAdmin = require("firebase-admin");
    const json = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    firebaseAdmin.initializeApp({ credential: firebaseAdmin.cert(json) });
    const { getAuth } = require("firebase-admin/auth");
    const { getMessaging } = require("firebase-admin/messaging");
    admin = { auth: getAuth, messaging: getMessaging };
    console.log("[firebase] Initialized successfully.");
    return admin;
  } catch (err) {
    console.error("[firebase] Failed to initialize:", err.message);
    return null;
  }
}

// Express middleware: verifies "Authorization: Bearer <firebase-id-token>"
// Used for endpoints where a WORKER manages their own listing after
// verifying their phone number via Firebase Phone Auth in the Android app.
async function verifyFirebaseToken(req, res, next) {
  const app = init();
  if (!app) {
    return res.status(501).json({
      success: false,
      message: "Firebase is not configured on this server yet. See README section on Firebase setup.",
    });
  }

  const header = req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ success: false, message: "Missing Authorization: Bearer <token> header" });
  }

  try {
    const decoded = await app.auth().verifyIdToken(token);
    req.firebaseUser = decoded; // decoded.uid, decoded.phone_number
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

// Send a push notification to a list of FCM device tokens.
// Silently no-ops (with a console log) if Firebase isn't configured.
async function sendPushToTokens(tokens, title, body) {
  const app = init();
  if (!app || tokens.length === 0) {
    console.log(`[firebase] Skipped push "${title}" (not configured or no devices).`);
    return { sent: 0 };
  }

  try {
    const response = await app.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
    });
    return { sent: response.successCount, failed: response.failureCount };
  } catch (err) {
    console.error("[firebase] Push send failed:", err.message);
    return { sent: 0, error: err.message };
  }
}

module.exports = { init, verifyFirebaseToken, sendPushToTokens };
