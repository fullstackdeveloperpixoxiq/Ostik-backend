const express = require("express");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

const { SendMessage, GetConversation } = require("../Controller/ChatbotController");
const { startModelHealthChecks } = require("../Services/GeminiService");
const optionalAuthMiddleware = require("../Middleware/OptionalAuthMiddleware");

const router = express.Router();

// Discover the available Gemini models and rank them by health in the background.
startModelHealthChecks();

// Rate limit per customer (when logged in) or per IP (guests).
// Behind a proxy (Render, Railway, Nginx...) set TRUST_PROXY so req.ip is the real client IP.
const keyGenerator = (req) => (req.user?.userId ? `u:${req.user.userId}` : `ip:${ipKeyGenerator(req.ip || "")}`);

const rateLimitResponse = (req, res) =>
  res.status(429).json({
    success: false,
    code: "RATE_LIMITED",
    message: "You're sending messages too quickly. Please wait a moment and try again.",
  });

const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.CHATBOT_RATE_LIMIT_PER_MINUTE) || 12,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator,
  handler: rateLimitResponse,
});

const dailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: Number(process.env.CHATBOT_RATE_LIMIT_PER_DAY) || 300,
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator,
  handler: rateLimitResponse,
});

const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator,
  handler: rateLimitResponse,
});

// Optional auth runs first so the limiter can key by customer.
router.post("/message", optionalAuthMiddleware, messageLimiter, dailyLimiter, SendMessage);
router.get("/conversations/:id", optionalAuthMiddleware, readLimiter, GetConversation);

module.exports = router;
