const { getDB } = require("../config/db.config");

/**
 * Webhook Request Logger Middleware
 *
 * Logs request details (headers, body, rawBody, method, url, query, ip, timestamp)
 * to the `webhook_logs` collection in a "fire-and-forget" style.
 */
const logWebhookRequest = (req, res, next) => {
  try {
    const db = getDB();
    const logData = {
      method: req.method,
      url: req.originalUrl || req.url,
      headers: req.headers,
      query: req.query,
      body: req.body || {},
      rawBody: req.rawBody || "",
      ip: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      receivedAt: new Date(),
    };

    // Asynchronously insert into db without awaiting (fire and forget)
    db.collection("webhook_logs")
      .insertOne(logData)
      .then((result) => {
        console.log(`💾 Webhook log stored | insertedId: ${result.insertedId}`);
      })
      .catch((err) => {
        console.error("❌ Failed to store webhook log in DB:", err.message);
      });
  } catch (err) {
    // Catch initialization or configuration errors so the request is never blocked
    console.error("❌ Webhook logging middleware failed to initiate:", err.message);
  }

  next();
};

module.exports = logWebhookRequest;
