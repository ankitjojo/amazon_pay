const axios = require("axios");
const { getDB } = require("../config/db.config");
const { sendSuccess, sendError } = require("../utils/response.utils");

const RVS_BASE = {
  production: "https://appstore-sdk.amazon.com/version/1.0/verifyReceiptId",
  sandbox:    "https://appstore-sdk.amazon.com/sandbox/version/1.0/verifyReceiptId",
};

/**
 * POST /api/iap/verify-receipt
 * Calls Amazon RVS, then inserts the full response into verify_payment
 * using native MongoDB insertOne — no schema, no validation, no indexes.
 */
const verifyReceipt = async (req, res) => {
  try {
    const { userId, receiptId, sandbox } = req.body;

    if (!userId || !userId.trim())     return sendError(res, 400, "userId is required");
    if (!receiptId || !receiptId.trim()) return sendError(res, 400, "receiptId is required");

    const developerSecret = process.env.AMAZON_DEVELOPER_SECRET;
    if (!developerSecret) return sendError(res, 500, "AMAZON_DEVELOPER_SECRET not configured");

    const useSandbox = sandbox !== undefined
      ? Boolean(sandbox)
      : process.env.AMAZON_RVS_SANDBOX === "true";

    const environment = useSandbox ? "sandbox" : "production";
    const rvsUrl = `${RVS_BASE[environment]}/developer/${encodeURIComponent(developerSecret)}/user/${encodeURIComponent(userId.trim())}/receiptId/${encodeURIComponent(receiptId.trim())}`;

    console.log(`🔍  Verifying receipt | env: ${environment} | userId: ${userId.trim()} | receiptId: ${receiptId.trim().slice(0, 30)}…`);

    let rvsResponse;
    try {
      rvsResponse = await axios.get(rvsUrl, {
        timeout: 10000,
        headers: { Accept: "application/json" },
        validateStatus: () => true,
      });
    } catch (networkError) {
      return sendError(res, 502, "Failed to reach Amazon RVS", networkError);
    }

    const rvsStatusCode = rvsResponse.status;
    const rvsData       = rvsResponse.data;

    console.log(`📡  Amazon RVS → HTTP ${rvsStatusCode}`);

    if (rvsStatusCode !== 200) {
      const msg = {
        400: "Invalid receiptId or userId",
        496: "Invalid developer secret",
        500: "Amazon RVS internal error",
      }[rvsStatusCode] || `Amazon RVS error (HTTP ${rvsStatusCode})`;
      return sendError(res, rvsStatusCode === 496 ? 500 : rvsStatusCode, msg, { rvsStatusCode, rvsData });
    }

    // ── insertOne: store rvsData exactly as returned by Amazon ────────────
    const result = await getDB().collection("verify_payment").insertOne({
      userId:       userId.trim(),
      receiptId:    receiptId.trim(),
      environment,
      rvsStatusCode,
      verifiedAt:   new Date(),
      rvsResponse:  rvsData,   // full Amazon response, untouched
    });

    console.log(`✅  Receipt verified & stored | insertedId: ${result.insertedId}`);

    return sendSuccess(res, 200, "Receipt verified successfully", {
      id:           result.insertedId,
      environment,
      receiptId:    receiptId.trim(),
      userId:       userId.trim(),
      verifiedAt:   new Date(),
      rvsResponse:  rvsData,
    });

  } catch (error) {
    console.error("❌  verifyReceipt error:", error.message);
    return sendError(res, 500, "Internal server error", error);
  }
};

/**
 * GET /api/iap/verify-receipt
 * List stored verification records — most recent first.
 */
const listVerifications = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip  = (Math.max(parseInt(req.query.page) || 1, 1) - 1) * limit;

    const filter = {};
    if (req.query.userId)      filter.userId      = req.query.userId;
    if (req.query.receiptId)   filter.receiptId   = req.query.receiptId;
    if (req.query.environment) filter.environment = req.query.environment;

    const docs  = await getDB().collection("verify_payment")
      .find(filter)
      .sort({ verifiedAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const total = await getDB().collection("verify_payment").countDocuments(filter);

    return sendSuccess(res, 200, "Verification records fetched", { total, records: docs });
  } catch (error) {
    console.error("❌  List error:", error.message);
    return sendError(res, 500, "Failed to fetch records", error);
  }
};

module.exports = { verifyReceipt, listVerifications };
