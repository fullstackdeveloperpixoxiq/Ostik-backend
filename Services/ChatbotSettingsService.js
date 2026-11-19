const ChatbotSettings = require("../models/ChatbotSettingsSchema");

/*
  AI CHATBOT SETTINGS (single "global" document, managed from
  Admin -> Chatbot Settings). Missing fields fall back to the defaults below,
  so existing databases need no migration.
*/

const envInt = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
};

const DEFAULTS = Object.freeze({
  enabled: true,
  assistantName: "Ostik AI Assistant",
  welcomeMessage:
    "Hi! Welcome to Ostik.\n\nI'm your personal shopping assistant. I can help you discover products, find great deals, track your orders and answer questions about shopping with Ostik.\n\nHow can I help you today?",
  suggestedQuestions: [
    "What products do you have?",
    "Any offers right now?",
    "Where is my latest order?",
    "How do I return or exchange?",
  ],
  additionalInstructions: "",
  temperature: null, // null = Gemini default
  maxOutputTokens: 4096,
  historyWindow: 12,
  maxMessageLength: 1000,
  usageLimitsEnabled: true,
  defaultMonthlyLimit: envInt("CHATBOT_DEFAULT_MONTHLY_LIMIT", 100),
});

// Validation rules for every editable field: [min, max] for numbers, max length for strings.
const RULES = {
  enabled: { type: "boolean" },
  usageLimitsEnabled: { type: "boolean" },
  assistantName: { type: "string", min: 1, max: 60 },
  welcomeMessage: { type: "string", min: 0, max: 600 },
  additionalInstructions: { type: "string", min: 0, max: 3000 },
  suggestedQuestions: { type: "list", maxItems: 6, maxLength: 120 },
  temperature: { type: "number", min: 0, max: 2, nullable: true },
  maxOutputTokens: { type: "int", min: 64, max: 8192 },
  historyWindow: { type: "int", min: 2, max: 40 },
  maxMessageLength: { type: "int", min: 100, max: 4000 },
  defaultMonthlyLimit: { type: "int", min: 0, max: 100000 },
};

const LABELS = {
  assistantName: "Assistant name",
  welcomeMessage: "Welcome message",
  additionalInstructions: "Additional instructions",
  suggestedQuestions: "Suggested questions",
  temperature: "Temperature",
  maxOutputTokens: "Max answer tokens",
  historyWindow: "History window",
  maxMessageLength: "Max message length",
  defaultMonthlyLimit: "Maximum messages per customer per month",
};

class SettingsValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

/** Validate a partial update. Returns a clean $set object or throws SettingsValidationError. */
const validate = (input = {}) => {
  const out = {};

  for (const [key, rule] of Object.entries(RULES)) {
    if (input[key] === undefined) continue;
    let v = input[key];
    const label = LABELS[key] || key;

    if (rule.type === "boolean") {
      if (typeof v !== "boolean") throw new SettingsValidationError(`${key} must be true or false.`);
    } else if (rule.type === "string") {
      if (typeof v !== "string") throw new SettingsValidationError(`${label} must be text.`);
      v = v.trim();
      if (v.length < rule.min) throw new SettingsValidationError(`${label} is required.`);
      if (v.length > rule.max) throw new SettingsValidationError(`${label} can be up to ${rule.max} characters.`);
    } else if (rule.type === "list") {
      if (!Array.isArray(v) || v.some((q) => typeof q !== "string")) {
        throw new SettingsValidationError(`${label} must be a list of questions.`);
      }
      v = [...new Set(v.map((q) => q.trim()).filter(Boolean))];
      if (v.length > rule.maxItems) throw new SettingsValidationError(`Up to ${rule.maxItems} suggested questions are allowed.`);
      if (v.some((q) => q.length > rule.maxLength)) {
        throw new SettingsValidationError(`Each suggested question can be up to ${rule.maxLength} characters.`);
      }
    } else {
      if (v === null && rule.nullable) {
        out[key] = null;
        continue;
      }
      if (typeof v !== "number" || !Number.isFinite(v) || (rule.type === "int" && !Number.isInteger(v)) || v < rule.min || v > rule.max) {
        const kind = rule.type === "int" ? "a whole number" : "a number";
        throw new SettingsValidationError(`${label} must be ${kind} between ${rule.min} and ${rule.max}.`);
      }
    }
    out[key] = v;
  }

  return out;
};

const getSettings = async () => {
  const doc = await ChatbotSettings.findOne({ key: "global" }).lean();
  const s = { ...DEFAULTS, suggestedQuestions: [...DEFAULTS.suggestedQuestions] };

  if (doc) {
    for (const key of Object.keys(DEFAULTS)) {
      if (doc[key] !== undefined && doc[key] !== null) s[key] = doc[key];
    }
    if (doc.temperature === null) s.temperature = null;
  }

  s.updatedAt = doc?.updatedAt || null;
  return s;
};

const updateSettings = async (input) => {
  const $set = validate(input);
  if (!Object.keys($set).length) throw new SettingsValidationError("Nothing to update.");

  await ChatbotSettings.findOneAndUpdate(
    { key: "global" },
    { $set, $setOnInsert: { key: "global" } },
    { upsert: true, returnDocument: "after", runValidators: true }
  );

  return getSettings();
};

/** The subset the customer-facing widget needs (no internal configuration). */
const toPublicConfig = (s) => ({
  enabled: s.enabled,
  assistantName: s.assistantName,
  welcomeMessage: s.welcomeMessage,
  suggestedQuestions: s.suggestedQuestions,
  maxMessageLength: s.maxMessageLength,
});

module.exports = { DEFAULTS, RULES, getSettings, updateSettings, validate, toPublicConfig, SettingsValidationError };
