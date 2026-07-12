// Simple API key based protection for write operations (add/edit/delete).
// Android app (or admin panel) must send header:  x-api-key: <ADMIN_API_KEY>
// Read-only GET endpoints stay public so the directory can be browsed by anyone.
function requireApiKey(req, res, next) {
  const configuredKey = process.env.ADMIN_API_KEY;

  // If no key configured (e.g. quick local testing), skip protection.
  if (!configuredKey) return next();

  const providedKey = req.header("x-api-key");
  if (!providedKey || providedKey !== configuredKey) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: missing or invalid x-api-key header",
    });
  }
  next();
}

module.exports = { requireApiKey };
