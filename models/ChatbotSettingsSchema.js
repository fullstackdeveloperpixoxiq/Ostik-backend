const mongoose = require("mongoose");

/*
  Global AI chatbot settings (single document, key = "global").
  Managed from Admin -> Chatbot Settings. Fields that are missing fall back to
  the defaults in Services/ChatbotSettingsService.js, so older documents keep
  working without a migration.
*/

const chatbotSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "global",
      unique: true,
      immutable: true,
    },

    // Availability
    enabled: { type: Boolean },

    // Persona & texts
    assistantName: { type: String, trim: true, maxlength: 60 },
    welcomeMessage: { type: String, maxlength: 600 },
    suggestedQuestions: { type: [String], default: undefined },
    additionalInstructions: { type: String, maxlength: 3000 },

    // Generation & context (Gemini)
    temperature: { type: Number, min: 0, max: 2 }, // null = model default
    maxOutputTokens: { type: Number, min: 64, max: 8192 },
    historyWindow: { type: Number, min: 2, max: 40 },

    // Limits & privacy
    maxMessageLength: { type: Number, min: 100, max: 4000 },

    usageLimitsEnabled: {
      type: Boolean,
      default: true,
    },

    // Maximum messages per customer per month (one global limit for everyone)
    defaultMonthlyLimit: {
      type: Number,
      default: 100,
      min: 0,
      max: 100000,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ChatbotSettings", chatbotSettingsSchema);
