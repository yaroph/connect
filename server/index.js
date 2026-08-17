const express = require("express");
const { PORT, DATA_DIR } = require("./config/constants");
const { isBlobsEnabled } = require("./storage/blobs");
const { securityHeaders, rateLimiter } = require("./middleware/security");
const errorHandler = require("./middleware/errorHandler");

// Route modules
const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const earnRoutes = require("./routes/earn.routes");
const questionsRoutes = require("./routes/questions.routes");
const adminRoutes = require("./routes/admin.routes");
const imagesRoutes = require("./routes/images.routes");

const app = express();

// -----------------
// Security Headers & Netlify Compatibility
// -----------------
app.use(securityHeaders);

app.use((req, _res, next) => {
  try {
    const u = String(req.url || "");
    const pfx = "/.netlify/functions/api";
    if (u.startsWith(pfx)) {
      req.url = u.slice(pfx.length) || "/";
    }
  } catch {
    // ignore
  }
  next();
});

app.use(express.json({ limit: "10mb" }));

app.use((req, _res, next) => {
  try {
    let u = req.url || "";
    u = u.replace(/^\/\.netlify\/functions\/api(?=\/)/, "");
    u = u.replace(/^\/api\/api\//, "/api/");
    req.url = u;
  } catch (_) {
    // ignore
  }
  next();
});

// -----------------
// Mount Modular API Routes with Protection
// -----------------
const authRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: 25,
  message: "Trop de tentatives de connexion, veuillez patienter 1 minute.",
});

app.use("/api/auth", authRateLimiter, authRoutes);
app.use("/api/user", userRoutes);
app.use("/api", earnRoutes);
app.use("/api", questionsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", imagesRoutes);

// Health check
app.get("/api/health", (req, res) => res.json({ ok: true }));

// Centralized Error Handler
app.use(errorHandler);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
    console.log(`[server] persistence: ${isBlobsEnabled() ? "netlify-blobs" : "filesystem"}`);
    if (!isBlobsEnabled()) {
      console.log(`[server] data dir: ${DATA_DIR}`);
    } else {
      console.log(`[server] blobs store: ${process.env.BLOBS_STORE_NAME || "bni-data"}`);
    }
  });
}

module.exports = app;
