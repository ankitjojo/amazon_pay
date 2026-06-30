const axios = require("axios");
const VerifyPayment = require("../models/verifyPayment.model");
const { sendSuccess, sendError } = require("../utils/response.utils");

// ── Amazon RVS Base URLs ─────────────────────────────────────────────────────
const RVS_BASE = {
  production: "https://appstore-sdk.amazon.com/version/1.0/verifyReceiptId",
  sandbox:    "https://appstore-sdk.amazon.com/sandbox/version/1.0/verifyReceiptId",
};

/**
 * Converts an epoch-millisecond timestamp from Amazon to a JS Date.
 * Returns null safely if the value is null / undefined / falsy.
 */
const epochToDate = (epochMs) => (epochMs != null ? new Date(epochMs) : null);

/**
 * POST /api/iap/verify-receipt
 *
 * Verifies an Amazon IAP receipt against Amazon's Receipt Verification Service (RVS).
 * Persists the full RVS response to the `verify_payment` collection.
 *
 * Request body:
 * {
 *   "userId":    "amzn1.account.XXXXXXXX",    // Amazon customer ID (required)
 *   "receiptId": "XXXXXXXXXXXXX",              // IAP receipt ID to verify (required)
 *   "sandbox":   true                          // optional; defaults to AMAZON_RVS_SANDBOX env var
 * }
 *
 * Amazon RVS URL pattern:
 * {baseUrl}/developer/{developerSecret}/user/{userId}/receiptId/{receiptId}
 *
 * RVS HTTP Status Codes:
 *   200 → Receipt is valid
 *   400 → Invalid receiptId or userId format
 *   496 → Invalid developer secret
 *   500 → Amazon RVS internal error
 */
const verifyReceipt = async (req, res) => {
  try {
    const { userId, receiptId, sandbox } = req.body;

    // ── Input Validation ─────────────────────────────────────────────────
    if (!userId || typeof userId !== "string" || !userId.trim()) {
      return sendError(res, 400, "userId is required and must be a non-empty string");
    }
    if (!receiptId || typeof receiptId !== "string" || !receiptId.trim()) {
      return sendError(res, 400, "receiptId is required and must be a non-empty string");
    }

    const developerSecret = process.env.AMAZON_DEVELOPER_SECRET;
    if (!developerSecret) {
      console.error("❌  AMAZON_DEVELOPER_SECRET is not set in environment variables");
      return sendError(res, 500, "Server misconfiguration: developer secret not configured");
    }

    // ── Determine environment ────────────────────────────────────────────
    // Priority: request body `sandbox` → env var AMAZON_RVS_SANDBOX → default false
    const useSandbox =
      sandbox !== undefined
        ? Boolean(sandbox)
        : process.env.AMAZON_RVS_SANDBOX === "true";

    const environment = useSandbox ? "sandbox" : "production";
    const baseUrl = RVS_BASE[environment];

    // ── Build RVS URL ────────────────────────────────────────────────────
    // Pattern: {base}/developer/{developerSecret}/user/{userId}/receiptId/{receiptId}
    const rvsUrl = `${baseUrl}/developer/${encodeURIComponent(developerSecret)}/user/${encodeURIComponent(userId.trim())}/receiptId/${encodeURIComponent(receiptId.trim())}`;

    console.log(
      `🔍  Verifying receipt | env: ${environment} | userId: ${userId.trim()} | receiptId: ${receiptId.trim().slice(0, 30)}…`
    );

    // ── Call Amazon RVS ──────────────────────────────────────────────────
    let rvsResponse;
    let rvsStatusCode;
    let rvsData;

    try {
      rvsResponse = await axios.get(rvsUrl, {
        timeout: 10000, // 10 second timeout
        headers: {
          Accept: "application/json",
        },
        // Don't throw on non-2xx so we can handle 400/496 explicitly
        validateStatus: () => true,
      });

      rvsStatusCode = rvsResponse.status;
      rvsData = rvsResponse.data;
    } catch (networkError) {
      console.error("❌  Network error calling Amazon RVS:", networkError.message);
      return sendError(res, 502, "Failed to reach Amazon RVS — network error", networkError);
    }

    console.log(`📡  Amazon RVS responded | status: ${rvsStatusCode} | env: ${environment}`);

    // ── Handle non-200 RVS responses ─────────────────────────────────────
    if (rvsStatusCode !== 200) {
      console.warn(
        `⚠️   Amazon RVS non-200 response | status: ${rvsStatusCode} | body:`,
        JSON.stringify(rvsData).slice(0, 200)
      );

      const errorMessages = {
        400: "Invalid receiptId or userId — Amazon RVS rejected the request",
        496: "Invalid developer secret — check AMAZON_DEVELOPER_SECRET in your .env",
        500: "Amazon RVS internal server error — try again later",
      };

      return sendError(
        res,
        rvsStatusCode === 496 ? 500 : rvsStatusCode,
        errorMessages[rvsStatusCode] || `Amazon RVS error (HTTP ${rvsStatusCode})`,
        { rvsStatusCode, rvsBody: rvsData }
      );
    }

    // ── Map RVS response fields + convert epoch timestamps to Date ────────
    const {
      autoRenewing         = null,
      baseReceipts         = null,
      betaProduct          = null,
      cancelDate           = null,
      cancelReason         = null,
      countryCode          = null,
      deferredDate         = null,
      deferredSku          = null,
      freeTrialEndDate     = null,
      fulfillmentDate      = null,
      fulfillmentResult    = null,
      gracePeriodEndDate   = null,
      parentProductId      = null,
      productId            = null,
      productType          = null,
      promotions           = null,
      purchaseDate         = null,
      purchaseMetadataMap  = null,
      quantity             = null,
      renewalDate          = null,
      term                 = null,
      termSku              = null,
      testTransaction      = null,
    } = rvsData;

    // ── Persist to verify_payment collection ─────────────────────────────
    const verificationDoc = await VerifyPayment.create({
      // Request context
      userId:       userId.trim(),
      receiptId:    receiptId.trim(),
      environment,
      rvsStatusCode,
      verifiedAt:   new Date(),

      // RVS response fields (epoch ms → Date where applicable)
      autoRenewing,
      baseReceipts,
      betaProduct,
      cancelDate:         epochToDate(cancelDate),
      cancelReason,
      countryCode,
      deferredDate:       epochToDate(deferredDate),
      deferredSku,
      freeTrialEndDate:   epochToDate(freeTrialEndDate),
      fulfillmentDate:    epochToDate(fulfillmentDate),
      fulfillmentResult,
      gracePeriodEndDate: epochToDate(gracePeriodEndDate),
      parentProductId,
      productId,
      productType,
      promotions,
      purchaseDate:       epochToDate(purchaseDate),
      purchaseMetadataMap,
      quantity,
      renewalDate:        epochToDate(renewalDate),
      term,
      termSku,
      testTransaction,

      // Full raw response for audit trail
      rawResponse: rvsData,
    });

    console.log(
      `✅  Receipt verified & stored | docId: ${verificationDoc._id} | productType: ${productType} | productId: ${productId} | cancelDate: ${cancelDate ? new Date(cancelDate).toISOString() : "null (active)"}`
    );

    // ── Derive a human-readable subscription status ───────────────────────
    const isActive = cancelDate === null && gracePeriodEndDate === null;
    const isInGracePeriod = gracePeriodEndDate !== null && cancelDate === null;
    const isCanceled = cancelDate !== null;

    const subscriptionStatus = isCanceled
      ? "CANCELED"
      : isInGracePeriod
      ? "GRACE_PERIOD"
      : isActive
      ? "ACTIVE"
      : "UNKNOWN";

    return sendSuccess(res, 200, "Receipt verified successfully", {
      id: verificationDoc._id,
      environment,
      receiptId:          verificationDoc.receiptId,
      userId:             verificationDoc.userId,
      productId,
      productType,
      subscriptionStatus,
      autoRenewing,
      purchaseDate:       verificationDoc.purchaseDate,
      cancelDate:         verificationDoc.cancelDate,
      cancelReason,
      renewalDate:        verificationDoc.renewalDate,
      freeTrialEndDate:   verificationDoc.freeTrialEndDate,
      gracePeriodEndDate: verificationDoc.gracePeriodEndDate,
      term,
      termSku,
      betaProduct,
      testTransaction,
      promotions,
      verifiedAt:         verificationDoc.verifiedAt,
    });
  } catch (error) {
    console.error("❌  Unexpected error in verifyReceipt:", error.message, error.stack);
    return sendError(res, 500, "Internal server error during receipt verification", error);
  }
};

/**
 * GET /api/iap/verify-receipt
 * List stored verification records with optional filters.
 *
 * Query params:
 *   ?userId=xxx          Filter by Amazon customer ID
 *   ?receiptId=xxx       Filter by receipt ID
 *   ?productType=xxx     Filter by CONSUMABLE | ENTITLED | SUBSCRIPTION
 *   ?environment=xxx     Filter by sandbox | production
 *   ?limit=20            Page size (max 100)
 *   ?page=1              Page number
 */
const listVerifications = async (req, res) => {
  try {
    const {
      userId,
      receiptId,
      productType,
      environment,
      limit: rawLimit = 20,
      page: rawPage = 1,
    } = req.query;

    const limit = Math.min(parseInt(rawLimit) || 20, 100);
    const page  = Math.max(parseInt(rawPage)  || 1, 1);
    const skip  = (page - 1) * limit;

    // Build query filter
    const filter = {};
    if (userId)      filter.userId      = userId;
    if (receiptId)   filter.receiptId   = receiptId;
    if (productType) filter.productType = productType.toUpperCase();
    if (environment) filter.environment = environment.toLowerCase();

    const [docs, total] = await Promise.all([
      VerifyPayment.find(filter)
        .sort({ verifiedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      VerifyPayment.countDocuments(filter),
    ]);

    return sendSuccess(res, 200, "Verification records fetched", {
      total,
      page,
      limit,
      records: docs,
    });
  } catch (error) {
    console.error("❌  Failed to fetch verification records:", error.message);
    return sendError(res, 500, "Failed to fetch verification records", error);
  }
};

module.exports = { verifyReceipt, listVerifications };
