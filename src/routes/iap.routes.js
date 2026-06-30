const express = require("express");
const router = express.Router();

const { verifyReceipt, listVerifications } = require("../controllers/iap.controller");

/**
 * @route  POST /api/iap/verify-receipt
 * @desc   Verify an Amazon IAP receipt against Amazon's RVS API and store the result
 * @access Private (call from your mobile app backend after receiving a purchase)
 *
 * Body:
 * {
 *   "userId":    "amzn1.account.XXXXXXXX",   // Amazon customer ID (required)
 *   "receiptId": "XXXXX...",                  // IAP receipt ID to verify (required)
 *   "sandbox":   true                         // optional; overrides AMAZON_RVS_SANDBOX env
 * }
 */
router.post("/verify-receipt", verifyReceipt);

/**
 * @route  GET /api/iap/verify-receipt
 * @desc   List stored receipt verification records with optional filters
 * @access Development / Admin — add auth middleware before production
 *
 * Query params: userId, receiptId, productType, environment, limit, page
 */
router.get("/verify-receipt", listVerifications);

module.exports = router;
