require("dotenv").config();
const app = require("./src/app");
const { closeDB } = require("./src/config/db.config");

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`🚀  Amazon Pay RTN Service running on http://localhost:${PORT}`);
  console.log(`📡  Webhook endpoint: POST http://localhost:${PORT}/api/webhooks/amazon/rtdn`);
  console.log(`📋  List endpoint:    GET  http://localhost:${PORT}/api/webhooks/amazon/rtdn`);
  console.log(`🌍  Environment: ${process.env.NODE_ENV || "development"}`);
});

// ── Graceful Shutdown ──────────────────────────────────────────────────────
const shutdown = async (signal) => {
  console.log(`\n⚠️   ${signal} received. Shutting down gracefully…`);
  server.close(async () => {
    console.log("✅  HTTP server closed.");
    try {
      await closeDB();
      console.log("✅  MongoDB connection closed.");
    } catch (err) {
      console.error("❌  Error closing MongoDB:", err.message);
    }
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  console.error("❌  Unhandled Rejection:", reason);
});
