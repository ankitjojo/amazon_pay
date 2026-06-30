const axios = require("axios");
const AmazonWebhook = require("../models/amazonWebhook.model");
const { sendSuccess, sendError } = require("../utils/response.utils");

/**
 * POST /api/webhooks/amazon/rtdn
 *
 * Stores the ENTIRE req.body as-is into the amazon_webhooks collection,
 * then handles Amazon SNS handshake and RTDN parsing on top.
 *
 * SNS Message Types handled:
 *   SubscriptionConfirmation  → auto-confirm via SubscribeURL
 *   Notification              → parse nested Message JSON for RTDN fields
 *   UnsubscribeConfirmation   → log and acknowledge
 *   (anything else)           → stored as-is, no errors
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

    // ── Basic payload guard ────────────────────────────────────────────────
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      console.warn("⚠️   Invalid payload (not a JSON object). Ignored.");
      return sendSuccess(res, 200, "Payload ignored — not a valid JSON object");
    }

    // ── Extract light metadata for indexed fields ──────────────────────────
    const snsType = payload.Type || null;

    // For Notification, try to parse the nested Message to get notificationType
    let notificationType = payload.notificationType || null;
    if (snsType === "Notification" && payload.Message) {
      try {
        const msg = JSON.parse(payload.Message);
        notificationType = msg.notificationType || null;
      } catch { /* ignore parse failures — raw payload still stored */ }
    }

    // ── Store the entire req.body as-is — no field extraction, no type risk ─
    const webhookDoc = await AmazonWebhook.create({
      snsType,
      notificationType,
      receivedAt: new Date(),
      payload,           // full req.body stored here, exactly as received
    });

    console.log(`💾  Stored to DB | docId: ${webhookDoc._id} | snsType: ${snsType || "direct"} | notificationType: ${notificationType || "N/A"}`);

    // ════════════════════════════════════════════════════════════════════════
    // CASE 1: SubscriptionConfirmation — auto-confirm the SNS subscription
    // ════════════════════════════════════════════════════════════════════════
    if (snsType === "SubscriptionConfirmation") {
      const { SubscribeURL, TopicArn, MessageId } = payload;
      console.log(`📬  SubscriptionConfirmation | TopicArn: ${TopicArn}`);
      console.log(`    Auto-confirming by calling SubscribeURL…`);

      try {
        const confirmResponse = await axios.get(SubscribeURL, { timeout: 10000 });
        console.log(`✅  SNS Subscription confirmed! HTTP Status: ${confirmResponse.status}`);
        console.log(`    Amazon will now deliver real RTDN Notifications to this endpoint.`);
      } catch (confirmError) {
        console.error("❌  Failed to auto-confirm SNS subscription:", confirmError.message);
        console.warn(`⚠️   Manual fallback — visit this URL to confirm:\n    ${SubscribeURL}`);
      }

      return sendSuccess(res, 200, "SubscriptionConfirmation received and confirmation attempted", {
        id: webhookDoc._id,
        topicArn: TopicArn,
        messageId: MessageId,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // CASE 2: UnsubscribeConfirmation — log and acknowledge
    // ════════════════════════════════════════════════════════════════════════
    if (snsType === "UnsubscribeConfirmation") {
      console.warn(`⚠️   UnsubscribeConfirmation | TopicArn: ${payload.TopicArn}`);
      return sendSuccess(res, 200, "UnsubscribeConfirmation acknowledged", { id: webhookDoc._id });
    }

    // ════════════════════════════════════════════════════════════════════════
    // CASE 3: Notification — real RTDN event wrapped in SNS envelope
    // ════════════════════════════════════════════════════════════════════════
    if (snsType === "Notification") {
      console.log(`📨  SNS Notification | MessageId: ${payload.MessageId} | notificationType: ${notificationType || "unknown"}`);
      return sendSuccess(res, 200, "RTDN Notification received and stored", {
        id: webhookDoc._id,
        notificationType,
        receivedAt: webhookDoc.receivedAt,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // CASE 4: Anything else (direct Postman test, unknown format, etc.)
    // Already stored above — just acknowledge.
    // ════════════════════════════════════════════════════════════════════════
    console.log(`📝  Direct / unknown payload stored | notificationType: ${notificationType || "N/A"}`);
    return sendSuccess(res, 200, "Webhook received and stored", {
      id: webhookDoc._id,
      receivedAt: webhookDoc.receivedAt,
    });

  } catch (error) {
    console.error("❌  Failed to process webhook:", error.message, error.stack);
    // 500 → Amazon will retry — only happens on genuine infrastructure failures
    return sendError(res, 500, "Internal server error while processing webhook", error);
  }
};

/**
 * GET /api/webhooks/amazon/rtdn
 * List stored webhook events.
 *
 * Query params: snsType, notificationType, limit, page
 */
const listWebhooks = async (req, res) => {
  try {
    const { snsType, notificationType, limit: rawLimit = 20, page: rawPage = 1 } = req.query;

    const limit = Math.min(parseInt(rawLimit) || 20, 100);
    const page  = Math.max(parseInt(rawPage)  || 1, 1);
    const skip  = (page - 1) * limit;

    const filter = {};
    if (snsType)          filter.snsType          = snsType;
    if (notificationType) filter.notificationType = notificationType;

    const [docs, total] = await Promise.all([
      AmazonWebhook.find(filter).sort({ receivedAt: -1 }).skip(skip).limit(limit).lean(),
      AmazonWebhook.countDocuments(filter),
    ]);

    return sendSuccess(res, 200, "Webhook records fetched", { total, page, limit, records: docs });
  } catch (error) {
    console.error("❌  Failed to fetch webhook records:", error.message);
    return sendError(res, 500, "Failed to fetch webhook records", error);
  }
};

module.exports = { handleAmazonRTN, listWebhooks };
