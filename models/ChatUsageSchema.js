const mongoose = require("mongoose");

/*
  Monthly AI chatbot usage per customer.

  One document per (user, period). `period` is the calendar month key "YYYY-MM"
  in the store's timezone (see ChatUsageService). A unique index guarantees a
  customer can never get two usage records for the same month.

  Billing unit: ONE successfully completed customer request to
  POST /api/chatbot/message (reply generated AND conversation saved).
  Internal Gemini calls, tool calls, retries and tokens are not counted.

  `gemini` holds the real Gemini token consumption behind those messages. It is
  for internal API cost monitoring only and is NEVER used as message credits.

  `pending` holds in-flight reservations. A request reserves a slot atomically
  before Gemini is called, and the reservation is either converted into a
  counted message (success) or removed (failure). Counting pending slots in the
  quota check is what stops parallel requests from going over the limit.
*/

const pendingSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    at: { type: Date, required: true },
  },
  { _id: false }
);

const chatUsageSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    period: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}$/,
    },

    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },

    messagesUsed: {
      type: Number,
      default: 0,
      min: 0,
    },

    pending: {
      type: [pendingSchema],
      default: [],
    },

    lastMessageAt: { type: Date, default: null },

    // Internal cost monitoring (not customer credits)
    gemini: {
      inputTokens: { type: Number, default: 0, min: 0 },
      outputTokens: { type: Number, default: 0, min: 0 },
      totalTokens: { type: Number, default: 0, min: 0 },
      calls: { type: Number, default: 0, min: 0 },
    },

    // Manual admin resets within this period
    resetCount: { type: Number, default: 0 },
    lastResetAt: { type: Date, default: null },
  },
  { timestamps: true }
);

chatUsageSchema.index({ user: 1, period: 1 }, { unique: true });
chatUsageSchema.index({ period: 1, messagesUsed: -1 });

module.exports = mongoose.model("ChatUsage", chatUsageSchema);
