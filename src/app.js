require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db.config");

const webhookRoutes = require("./routes/webhook.routes");

const app = express();

// ── Connect to MongoDB ─────────────────────────────────────────────────────
connectDB();

// ── Global Middleware ──────────────────────────────────────────────────────
// NOTE: We do NOT attach express.json() globally on the webhook route —
// the raw-body middleware handles parsing per-route to preserve raw bytes.
// express.json() is added here only for any future non-webhook routes.
app.use((req, res, next) => {
  if (req.path.startsWith("/api/webhooks")) {
    // Skip global JSON parsing — handled per-route by captureRawBody
    return next();
  }
  express.json({ limit: "1mb" })(req, res, next);
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/webhooks")) return next();
  express.urlencoded({ extended: true })(req, res, next);
});

// ── Routes ─────────────────────────────────────────────────────────────────
app.use("/api/webhooks/amazon", webhookRoutes);

// ── Root Health Check ──────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status: "running",
    service: "Amazon Pay RTN Webhook Service",
    timestamp: new Date().toISOString(),
    endpoints: {
      ingest: "POST /api/webhooks/amazon/rtdn",
      list: "GET  /api/webhooks/amazon/rtdn",
    },
  });
});

// ── 404 Catch-all ──────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ── Global Error Handler ───────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("❌  Unhandled error:", err.message);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    ...(process.env.NODE_ENV !== "production" && { error: err.message }),
  });
});

module.exports = app;
