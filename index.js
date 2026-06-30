require("dotenv").config();
const app = require("./src/app");

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`🚀  Amazon Pay RTN Service running on http://localhost:${PORT}`);
  console.log(`📡  Webhook endpoint: POST http://localhost:${PORT}/api/webhooks/amazon/rtdn`);
  console.log(`📋  List endpoint:    GET  http://localhost:${PORT}/api/webhooks/amazon/rtdn`);
  console.log(`🌍  Environment: ${process.env.NODE_ENV || "development"}`);
});

// ── Graceful Shutdown ──────────────────────────────────────────────────────
const shutdown = (signal) => {
  console.log(`\n⚠️   ${signal} received. Shutting down gracefully…`);
  server.close(() => {
    console.log("✅  HTTP server closed.");
    const mongoose = require("mongoose");
    mongoose.connection.close(false, () => {
      console.log("✅  MongoDB connection closed.");
      process.exit(0);
    });
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

// Catch unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌  Unhandled Rejection at:", promise, "reason:", reason);
});
