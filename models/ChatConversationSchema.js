const mongoose = require("mongoose");

/*
  Customer chatbot conversation.

  Ownership:
  - Logged-in customer conversations store `user`.
  - Guest conversations store only a SHA-256 hash of a random guest token that
    is handed to that browser once. Without the raw token nobody else can read
    or continue the conversation, even if they know the conversation ID.

  Privacy: only the customer's message text and the assistant's final reply are
  stored. Raw tool results (orders, returns, ...) are never persisted here.
*/

const productCardSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    name: String,
    image: String,
    category: String,
    variantName: String,
    sku: String,
    modelNumber: String,
    variantCount: Number,
    price: Number,
    finalPrice: Number,
    discountPercent: Number,
    inStock: Boolean,
    url: String,
  },
  { _id: false }
);

const chatMessageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 8000,
    },
    products: {
      type: [productCardSchema],
      default: undefined,
    },
    requiresLogin: {
      type: Boolean,
      default: undefined,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const chatConversationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    guestTokenHash: {
      type: String,
      default: null,
      select: false,
    },

    messages: {
      type: [chatMessageSchema],
      default: [],
    },

    lastActivityAt: {
      type: Date,
      default: Date.now,
    },

    // MongoDB TTL index removes stale conversations automatically.
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

chatConversationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("ChatConversation", chatConversationSchema);
