const mongoose = require("mongoose");

/**
 * Schema for Amazon Receipt Verification Service (RVS) responses.
 * Collection: verify_payment
 *
 * Stores the full verification response from Amazon's RVS API along
 * with the request context (who verified what, when, and from which env).
 *
 * Amazon RVS API Docs:
 * https://developer.amazon.com/docs/in-app-purchasing/iap-rvs-examples.html
 */
const verifyPaymentSchema = new mongoose.Schema(
  {
    // ── Request Context ────────────────────────────────────────────────────
    userId: {
      type: String,
      required: true,
      trim: true,
      index: true,
      comment: "Amazon customer ID passed in the verification request",
    },

    receiptId: {
      type: String,
      required: true,
      trim: true,
      index: true,
      comment: "The receiptId that was submitted to Amazon RVS for verification",
    },

    environment: {
      type: String,
      enum: ["sandbox", "production"],
      required: true,
      index: true,
      comment: "Which Amazon RVS environment was called",
    },

    rvsStatusCode: {
      type: Number,
      default: null,
      comment: "HTTP status code returned by Amazon RVS (200 = valid, 400 = invalid, 496 = invalid developer secret)",
    },

    verifiedAt: {
      type: Date,
      default: () => new Date(),
      index: true,
      comment: "Server-side timestamp when the verification was performed",
    },

    // ── Amazon RVS Response Fields ─────────────────────────────────────────
    // These map 1-to-1 with the Amazon RVS JSON response body.

    autoRenewing: {
      type: Boolean,
      default: null,
    },

    baseReceipts: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    betaProduct: {
      type: Boolean,
      default: null,
    },

    cancelDate: {
      type: Date,
      default: null,
      comment: "null = active purchase; non-null = canceled/expired date",
    },

    cancelReason: {
      type: Number,
      default: null,
      comment: "0 = customer canceled, 1 = Amazon canceled, 2 = other. null = not canceled",
    },

    countryCode: {
      type: String,
      trim: true,
      default: null,
    },

    deferredDate: {
      type: Date,
      default: null,
    },

    deferredSku: {
      type: String,
      trim: true,
      default: null,
    },

    freeTrialEndDate: {
      type: Date,
      default: null,
    },

    fulfillmentDate: {
      type: Date,
      default: null,
    },

    fulfillmentResult: {
      type: String,
      trim: true,
      default: null,
    },

    gracePeriodEndDate: {
      type: Date,
      default: null,
      comment: "null = not in grace period; non-null = grace period active until this date",
    },

    parentProductId: {
      type: String,
      trim: true,
      default: null,
    },

    productId: {
      type: String,
      trim: true,
      index: true,
      default: null,
      comment: "Amazon product/SKU identifier",
    },

    productType: {
      type: String,
      trim: true,
      enum: ["CONSUMABLE", "ENTITLED", "SUBSCRIPTION", null],
      default: null,
    },

    promotions: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      comment: "Array of promotion objects if purchase used promotional pricing",
    },

    purchaseDate: {
      type: Date,
      default: null,
      comment: "Amazon returns this as epoch milliseconds — stored as Date",
    },

    purchaseMetadataMap: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    quantity: {
      type: Number,
      default: null,
    },

    renewalDate: {
      type: Date,
      default: null,
    },

    term: {
      type: String,
      trim: true,
      default: null,
      comment: "e.g. '1 Month', '1 Week'",
    },

    termSku: {
      type: String,
      trim: true,
      default: null,
      comment: "e.g. 'com.example.product_term'",
    },

    testTransaction: {
      type: Boolean,
      default: null,
    },

    // ── Full Raw Response ──────────────────────────────────────────────────
    rawResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      comment: "Complete unmodified JSON response from Amazon RVS for audit trail",
    },
  },
  {
    collection: "verify_payment", // Explicit collection name
    timestamps: true,             // Adds createdAt + updatedAt
    versionKey: false,
  }
);

// Compound index: quickly look up all verifications for a user
verifyPaymentSchema.index({ userId: 1, verifiedAt: -1 });

// Compound index: look up verifications by receipt + environment
verifyPaymentSchema.index({ receiptId: 1, environment: 1 });

// Compound index: filter active subscriptions by product
verifyPaymentSchema.index({ productId: 1, productType: 1, cancelDate: 1 });

const VerifyPayment = mongoose.model("VerifyPayment", verifyPaymentSchema);

module.exports = VerifyPayment;
