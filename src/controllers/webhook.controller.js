const axios = require("axios");
const AmazonWebhook = require("../models/amazonWebhook.model");
const { sendSuccess, sendError } = require("../utils/response.utils");

/**
 * POST /api/webhooks/amazon/rtdn
 *
 * Handles THREE types of incoming messages from Amazon SNS:
 *
 * 1. SubscriptionConfirmation  → Amazon verifying your endpoint (one-time handshake)
 *    Action: Auto-confirm by calling the SubscribeURL → subscription becomes active
 *
 * 2. Notification              → A real RTDN event (subscription purchased, canceled, etc.)
 *    Action: Parse the nested Message JSON → extract RTN fields → persist to DB
 *
 * 3. UnsubscribeConfirmation   → Amazon notifying you that the topic was unsubscribed
 *    Action: Log and acknowledge with 200
 *
 * Amazon's SNS always expects HTTP 200 to stop retries.
 */
const handleAmazonRTN = async (req, res) => {
  try {
    const payload = req.body;
    const rawBody = req.rawBody;

    // ── Basic payload guard ────────────────────────────────────────────────
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      console.warn("⚠️   Invalid payload received (not a JSON object). Raw:", rawBody);
      return sendSuccess(res, 200, "Payload ignored — not a valid JSON object");
    }

    const snsType = payload.Type;

    // ════════════════════════════════════════════════════════════════════════
    // CASE 1: SubscriptionConfirmation
    // Amazon sends this ONCE when you first register your endpoint.
    // You MUST visit the SubscribeURL to activate the subscription.
    // After confirmation, Amazon will start delivering real RTDN events.
    // ════════════════════════════════════════════════════════════════════════
    if (snsType === "SubscriptionConfirmation") {
      const { SubscribeURL, TopicArn, Token, MessageId } = payload;

      console.log(`📬  SNS SubscriptionConfirmation received`);
      console.log(`    TopicArn:  ${TopicArn}`);
      console.log(`    MessageId: ${MessageId}`);
      console.log(`    Auto-confirming by calling SubscribeURL…`);

      try {
        // Call the SubscribeURL — this activates the SNS subscription
        const confirmResponse = await axios.get(SubscribeURL, { timeout: 10000 });
        console.log(`✅  SNS Subscription confirmed! Status: ${confirmResponse.status}`);
        console.log(`    Amazon will now deliver real RTDN notifications to this endpoint.`);
      } catch (confirmError) {
        console.error("❌  Failed to auto-confirm SNS subscription:", confirmError.message);
        console.warn(`⚠️   Please manually confirm by visiting:\n    ${SubscribeURL}`);
        // Still return 200 — the confirmation URL stays valid for 3 days
      }

      return sendSuccess(res, 200, "SubscriptionConfirmation received and confirmation attempted", {
        topicArn: TopicArn,
        messageId: MessageId,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // CASE 2: UnsubscribeConfirmation
    // The SNS topic was unsubscribed. Log and acknowledge.
    // ════════════════════════════════════════════════════════════════════════
    if (snsType === "UnsubscribeConfirmation") {
      console.warn(`⚠️   SNS UnsubscribeConfirmation received. TopicArn: ${payload.TopicArn}`);
      return sendSuccess(res, 200, "UnsubscribeConfirmation acknowledged");
    }

    // ════════════════════════════════════════════════════════════════════════
    // CASE 3: Notification — real RTDN event from Amazon
    // The actual RTN payload is JSON-stringified inside the `Message` field.
    // ════════════════════════════════════════════════════════════════════════
    if (snsType === "Notification") {
      console.log(`📨  SNS Notification received | MessageId: ${payload.MessageId}`);

      let rtnPayload;
      try {
        // The Message field is a JSON string — parse it to get the real RTN data
        rtnPayload = typeof payload.Message === "string"
          ? JSON.parse(payload.Message)
          : payload.Message;
      } catch (parseError) {
        console.error("❌  Failed to parse SNS Message field as JSON:", payload.Message);
        return sendSuccess(res, 200, "Notification received but Message JSON parse failed");
      }

      const {
        notificationType,
        rvsVersion = null,
        customerId = null,
        receiptId = null,
        productId = null,
        betaProductTransaction = false,
      } = rtnPayload;

      if (!notificationType) {
        console.warn("⚠️   RTN Notification missing notificationType. Message:", rtnPayload);
        return sendSuccess(res, 200, "Notification acknowledged — missing notificationType");
      }

      // ── Persist RTN to amazon_webhooks collection ──────────────────────
      const webhookDoc = await AmazonWebhook.create({
        notificationType,
        rvsVersion,
        customerId,
        receiptId,
        productId,
        betaProductTransaction: Boolean(betaProductTransaction),
        receivedAt: new Date(),
        rawBody: rtnPayload, // Store the parsed RTN payload, not the SNS envelope
      });

      console.log(
        `✅  RTN stored → [${notificationType}] docId: ${webhookDoc._id} | customerId: ${customerId || "N/A"} | productId: ${productId || "N/A"} | receivedAt: ${webhookDoc.receivedAt.toISOString()}`
      );

      return sendSuccess(res, 200, "RTDN Notification received and stored", {
        id: webhookDoc._id,
        notificationType: webhookDoc.notificationType,
        receivedAt: webhookDoc.receivedAt,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // CASE 4: Direct RTN payload (non-SNS — e.g. Postman testing)
    // Handles payloads posted directly without the SNS envelope.
    // ════════════════════════════════════════════════════════════════════════
    const {
      notificationType,
      rvsVersion = null,
      customerId = null,
      receiptId = null,
      productId = null,
      betaProductTransaction = false,
    } = payload;

    if (!notificationType) {
      console.warn("⚠️   Payload has no recognized SNS Type and no notificationType field. Raw:", rawBody);
      return sendSuccess(res, 200, "Payload ignored — unrecognized format");
    }

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
      `✅  RTN (direct) stored → [${notificationType}] docId: ${webhookDoc._id} | receivedAt: ${webhookDoc.receivedAt.toISOString()}`
    );

    return sendSuccess(res, 200, "Webhook received and stored", {
      id: webhookDoc._id,
      notificationType: webhookDoc.notificationType,
      receivedAt: webhookDoc.receivedAt,
    });

  } catch (error) {
    console.error("❌  Failed to process RTN webhook:", error.message, error.stack);
    // Return 500 so Amazon SNS knows to retry — only for genuine infrastructure failures
    return sendError(res, 500, "Internal server error while processing webhook", error);
  }
};

/**
 * GET /api/webhooks/amazon/rtdn
 * List stored webhook events (dev / admin use).
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
