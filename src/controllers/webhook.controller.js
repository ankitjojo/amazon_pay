const axios = require("axios");
const { getDB } = require("../config/db.config");
const { sendSuccess, sendError } = require("../utils/response.utils");

/**
 * POST /api/webhooks/amazon/rtdn
 *
 * Inserts the entire req.body as-is into amazon_webhooks collection
 * using native MongoDB insertOne — no schema, no validation, no indexes.
 */
const handleAmazonRTN = async (req, res) => {
  try {
    const payload = req.body;

    // ── Incoming request log ───────────────────────────────────────────────
    console.log("─────────────────────────────────────────────────────");
    console.log(`📩  Webhook hit: POST /api/webhooks/amazon/rtdn`);
    console.log(`🕐  Time: ${new Date().toISOString()}`);
    console.log(`🔑  SNS Type: ${payload?.Type || "(none — direct payload)"}`);
    console.log(`📦  req.body:`, JSON.stringify(payload, null, 2));
    console.log("─────────────────────────────────────────────────────");

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      console.warn("⚠️   Invalid payload (not a JSON object). Ignored.");
      return sendSuccess(res, 200, "Payload ignored — not a valid JSON object");
    }

    // ── insertOne: store the raw payload exactly as received ──────────────
    const result = await getDB().collection("amazon_webhooks").insertOne({
      receivedAt: new Date(),
      payload,
    });

    console.log(`💾  Stored | insertedId: ${result.insertedId} | snsType: ${payload.Type || "direct"}`);

    // ── SubscriptionConfirmation: auto-confirm with Amazon ─────────────────
    if (payload.Type === "SubscriptionConfirmation") {
      console.log(`📬  SubscriptionConfirmation | TopicArn: ${payload.TopicArn}`);
      try {
        const r = await axios.get(payload.SubscribeURL, { timeout: 10000 });
        console.log(`✅  SNS confirmed! HTTP: ${r.status}`);
      } catch (e) {
        console.error("❌  Auto-confirm failed:", e.message);
      }
      return sendSuccess(res, 200, "SubscriptionConfirmation received", { id: result.insertedId });
    }

    if (payload.Type === "UnsubscribeConfirmation") {
      console.warn(`⚠️   UnsubscribeConfirmation | TopicArn: ${payload.TopicArn}`);
      return sendSuccess(res, 200, "UnsubscribeConfirmation acknowledged", { id: result.insertedId });
    }

    return sendSuccess(res, 200, "Webhook received and stored", {
      id: result.insertedId,
      receivedAt: new Date(),
    });

  } catch (error) {
    console.error("❌  Webhook error:", error.message);
    return sendError(res, 500, "Internal server error", error);
  }
};

/**
 * GET /api/webhooks/amazon/rtdn
 * List stored webhook documents — most recent first.
 */
const listWebhooks = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip  = (Math.max(parseInt(req.query.page) || 1, 1) - 1) * limit;

    const docs  = await getDB().collection("amazon_webhooks")
      .find({})
      .sort({ receivedAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const total = await getDB().collection("amazon_webhooks").countDocuments();

    return sendSuccess(res, 200, "Webhook records fetched", { total, records: docs });
  } catch (error) {
    console.error("❌  List error:", error.message);
    return sendError(res, 500, "Failed to fetch records", error);
  }
};

module.exports = { handleAmazonRTN, listWebhooks };
