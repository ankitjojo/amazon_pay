require("dotenv").config();
const express = require("express");
const { connectDB } = require("./config/db.config");

const webhookRoutes = require("./routes/webhook.routes");
const iapRoutes     = require("./routes/iap.routes");

const app = express();

// ── Connect to MongoDB ─────────────────────────────────────────────────────
connectDB().catch((err) => {
  console.error("❌  MongoDB connection failed:", err.message);
  process.exit(1);
});

// ── Global Middleware ──────────────────────────────────────────────────────
// Webhook route uses captureRawBody middleware — skip global JSON parsing for it
app.use((req, res, next) => {
  if (req.path.startsWith("/api/webhooks")) return next();
  express.json({ limit: "1mb" })(req, res, next);
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/webhooks")) return next();
  express.urlencoded({ extended: true })(req, res, next);
});

// ── Routes ─────────────────────────────────────────────────────────────────
app.use("/api/webhooks/amazon", webhookRoutes);
app.use("/api/iap", iapRoutes);

// ── Root Health Check ──────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status: "running",
    service: "Amazon Pay RTN Webhook Service",
    timestamp: new Date().toISOString(),
    endpoints: {
      webhooks: {
        ingest: "POST /api/webhooks/amazon/rtdn",
        list:   "GET  /api/webhooks/amazon/rtdn",
      },
      iap: {
        verifyReceipt:     "POST /api/iap/verify-receipt",
        listVerifications: "GET  /api/iap/verify-receipt",
      },
    },
  });
});

// ── 404 ────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ── Global Error Handler ───────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("❌  Unhandled error:", err.message);
  res.status(500).json({ success: false, message: "Internal server error" });
});

module.exports = app;
