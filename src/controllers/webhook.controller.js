const AmazonWebhook = require("../models/amazonWebhook.model");
const { sendSuccess, sendError } = require("../utils/response.utils");

/**
 * POST /api/webhooks/amazon/rtdn
 *
 * Ingests Amazon Real-Time Developer Notifications (RTDN).
 *
 * Amazon's RTN system expects an HTTP 200 response to acknowledge receipt.
 * Any non-200 response will trigger Amazon's retry mechanism.
 *
 * Amazon RTN Payload shape (reference):
 * {
 *   "notificationType": "SUBSCRIPTION_PURCHASED",
 *   "rvsVersion": "2.0",
 *   "customerId": "amzn1.account.XXXXX",
 *   "receiptId": "XXXXXXXXXXXXXXXXXXXXXXXXXX",
 *   "productId": "com.example.product.monthly",
 *   "betaProductTransaction": false
 * }
 */
const handleAmazonRTN = async (req, res) => {
  try {
    const payload = req.body;
    const rawBody = req.rawBody;

    // ── Basic payload guard ────────────────────────────────────────────────
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      console.warn("⚠️   Invalid RTN payload received:", rawBody);
      // Still return 200 to avoid Amazon retry storms on malformed test pings
      return sendSuccess(res, 200, "Payload ignored — not a valid JSON object");
    }

    const {
      notificationType,
      rvsVersion = null,
      customerId = null,
      receiptId = null,
      productId = null,
      betaProductTransaction = false,
    } = payload;

    // ── notificationType is mandatory per Amazon's RTN spec ────────────────
    if (!notificationType) {
      console.warn("⚠️   RTN missing notificationType field. Raw:", rawBody);
      return sendSuccess(res, 200, "Payload ignored — missing notificationType");
    }

    // ── Persist to amazon_webhooks collection ──────────────────────────────
    const webhookDoc = await AmazonWebhook.create({
      notificationType,
      rvsVersion,
      customerId,
      receiptId,
      productId,
      betaProductTransaction: Boolean(betaProductTransaction),
      receivedAt: new Date(),
      rawBody: typeof rawBody === "string" ? (() => {
        try { return JSON.parse(rawBody); } catch { return rawBody; }
      })() : (rawBody || payload),
    });

    console.log(
      `✅  RTN stored → [${webhookDoc.notificationType}] docId: ${webhookDoc._id} | customerId: ${customerId || "N/A"} | productId: ${productId || "N/A"} | receivedAt: ${webhookDoc.receivedAt.toISOString()}`
    );

    // ── HTTP 200 is the required acknowledgment signal to Amazon ───────────
    return sendSuccess(res, 200, "Webhook received and stored", {
      id: webhookDoc._id,
      notificationType: webhookDoc.notificationType,
      receivedAt: webhookDoc.receivedAt,
    });
  } catch (error) {
    console.error("❌  Failed to process RTN webhook:", error.message, error.stack);

    // Return 500 so Amazon knows to retry — only use for systemic DB failures
    return sendError(res, 500, "Internal server error while processing webhook", error);
  }
};

/**
 * GET /api/webhooks/amazon/rtdn
 * Health-check / list endpoint (development only).
 * Returns the 20 most recent stored webhook events.
 */
const listWebhooks = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const page  = Math.max(parseInt(req.query.page)  || 1, 1);
    const skip  = (page - 1) * limit;

    const [docs, total] = await Promise.all([
      AmazonWebhook.find({})
        .sort({ receivedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AmazonWebhook.countDocuments(),
    ]);

    return sendSuccess(res, 200, "Webhook records fetched", {
      total,
      page,
      limit,
      records: docs,
    });
  } catch (error) {
    console.error("❌  Failed to fetch RTN records:", error.message);
    return sendError(res, 500, "Failed to fetch webhook records", error);
  }
};

module.exports = { handleAmazonRTN, listWebhooks };
