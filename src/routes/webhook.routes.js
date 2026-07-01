const express = require("express");
const router = express.Router();

const captureRawBody = require("../middleware/rawBody.middleware");
const logWebhookRequest = require("../middleware/webhookLogger.middleware");
const { handleAmazonRTN, listWebhooks } = require("../controllers/webhook.controller");

/**
 * @route  POST /api/webhooks/amazon/rtdn
 * @desc   Ingest Amazon Real-Time Developer Notifications (RTDN)
 * @access Public (secured by Amazon's server-to-server delivery)
 *
 * Raw body capture middleware runs BEFORE any JSON parsing
 * to preserve the original payload bytes for signature verification.
 */
// router.post("/rtdn",  handleAmazonRTN);
router.post("/rtdn", captureRawBody, logWebhookRequest, handleAmazonRTN);

/**
 * @route  GET /api/webhooks/amazon/rtdn
 * @desc   List stored webhook events (dev / admin use)
 * @access Development only — add auth middleware before production
 */
router.get("/rtdn", listWebhooks);

module.exports = router;
