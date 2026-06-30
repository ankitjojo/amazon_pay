const mongoose = require("mongoose");

/**
 * Ultra-flexible schema for storing Amazon webhook payloads.
 * Collection: amazon_webhooks
 *
 * Uses strict: false so Mongoose never rejects any field shape.
 * The entire req.body is stored as-is under `payload` (Mixed type).
 * No type validation — works for any Amazon SNS message type.
 */
const amazonWebhookSchema = new mongoose.Schema(
  {
    // Indexed metadata for easy querying — extracted from the payload
    snsType: {
      type: String,
      default: null,
      index: true,
      comment: "payload.Type — e.g. Notification, SubscriptionConfirmation, etc.",
    },

    notificationType: {
      type: String,
      default: null,
      index: true,
      comment: "RTN notificationType from inside the SNS Message field",
    },

    receivedAt: {
      type: Date,
      default: () => new Date(),
      index: true,
    },

    // ── The full, unmodified req.body stored as-is ─────────────────────────
    // Mixed + strict:false means any shape, any fields, no type errors ever.
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  {
    collection: "amazon_webhooks",
    strict: false,      // Allow any extra fields without schema validation
    minimize: false,    // Preserve empty objects/arrays as-is
    timestamps: true,   // createdAt + updatedAt
    versionKey: false,
  }
);

amazonWebhookSchema.index({ snsType: 1, receivedAt: -1 });
amazonWebhookSchema.index({ notificationType: 1, receivedAt: -1 });

const AmazonWebhook = mongoose.model("AmazonWebhook", amazonWebhookSchema);

module.exports = AmazonWebhook;
