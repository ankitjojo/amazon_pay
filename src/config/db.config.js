const mongoose = require("mongoose");

/**
 * Establishes a connection to MongoDB.
 * Uses MONGO_URI from environment — falls back to local 'amazon_pay' database.
 */
const connectDB = async () => {
  const uri = process.env.MONGO_URI || "mongodb://localhost:27017/amazon_pay";

  try {
    await mongoose.connect(uri);
    console.log(`✅  MongoDB connected → ${mongoose.connection.host}/${mongoose.connection.name}`);
  } catch (error) {
    console.error("❌  MongoDB connection failed:", error.message);
    process.exit(1); // Exit with failure — let process manager restart
  }

  mongoose.connection.on("disconnected", () => {
    console.warn("⚠️   MongoDB disconnected. Reconnecting…");
  });

  mongoose.connection.on("error", (err) => {
    console.error("❌  MongoDB error:", err.message);
  });
};

module.exports = connectDB;
