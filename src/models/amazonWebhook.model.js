const mongoose = require("mongoose");

/**
 * Schema for Amazon Appstore Real-Time Developer Notifications (RTDN).
 * Collection: amazon_webhooks
 *
 * Fields mirror the Amazon RTN payload spec:
 * https://developer.amazon.com/docs/in-app-purchasing/rtdn-api.html
 */
const amazonWebhookSchema = new mongoose.Schema(
  {
    // ── Core Notification Fields ───────────────────────────────────────────
    notificationType: {
      type: String,
      required: true,
      trim: true,
      index: true,
      comment:
        "e.g. SUBSCRIBE, CANCEL_SUBSCRIPTION, RENEWAL, SUBSCRIPTION_PURCHASED, etc.",
    },

    rvsVersion: {
      type: String,
      trim: true,
      default: null,
      comment: "Receipt Verification Service version string",
    },

    customerId: {
      type: String,
      trim: true,
      index: true,
      default: null,
      comment: "Amazon customer ID tied to the transaction",
    },

    receiptId: {
      type: String,
      trim: true,
      index: true,
      default: null,
      comment: "Unique receipt identifier for the IAP transaction",
    },

    productId: {
      type: String,
      trim: true,
      index: true,
      default: null,
      comment: "Amazon product/SKU identifier",
    },

    betaProductTransaction: {
      type: Boolean,
      default: false,
      comment: "True if this is a sandbox / beta test transaction",
    },

    // ── Timestamp Fields ───────────────────────────────────────────────────
    receivedAt: {
      type: Date,
      default: () => new Date(),
      index: true,
      comment: "Server-side timestamp when the webhook was received",
    },

    // ── Raw Payload Preservation ───────────────────────────────────────────
    rawBody: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      comment:
        "The complete, unmodified incoming JSON payload for audit/debug purposes",
    },
  },
  {
    // ── Collection Options ─────────────────────────────────────────────────
    collection: "amazon_webhooks", // Explicit collection name
    timestamps: true,              // Adds createdAt + updatedAt
    versionKey: false,             // Disable __v field
  }
);

// Compound index for efficient queries by customer + time
amazonWebhookSchema.index({ customerId: 1, receivedAt: -1 });

// Compound index for product + notification type queries
amazonWebhookSchema.index({ productId: 1, notificationType: 1 });

const AmazonWebhook = mongoose.model("AmazonWebhook", amazonWebhookSchema);

module.exports = AmazonWebhook;
