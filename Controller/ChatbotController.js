const crypto = require("crypto");
const mongoose = require("mongoose");

const ChatConversation = require("../models/ChatConversationSchema");
const { generateReply, ChatbotError } = require("../Services/GeminiService");

/*
  CUSTOMER CHATBOT CONTROLLER

  POST /api/chatbot/message
  GET  /api/chatbot/conversations/:id

  Ownership model:
  - Logged-in customer -> conversation.user must equal req.user.userId (from JWT).
  - Guest              -> conversation has no user, and the caller must present
                          the random guest token (header "X-Chat-Guest-Token")
                          whose SHA-256 hash is stored on the conversation.
  Any mismatch returns 404 so conversation IDs cannot be probed.
*/

const MAX_MESSAGE_LENGTH = 1000;
const MAX_STORED_MESSAGES = 60; // per conversation
const MAX_CONTEXT_MESSAGES = 12; // sent to Gemini per request
const MAX_CONTEXT_CHARS_PER_MESSAGE = 2000;
const MAX_CARDS = 6;
const GUEST_TTL_DAYS = 7;
const USER_TTL_DAYS = 30;

// Prevents duplicate/parallel requests for the same conversation (single instance).
const inFlight = new Set();

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const expiryFor = (isUser) =>
  new Date(Date.now() + (isUser ? USER_TTL_DAYS : GUEST_TTL_DAYS) * 24 * 60 * 60 * 1000);

const getGuestToken = (req) => {
  const token = req.headers["x-chat-guest-token"];
  return typeof token === "string" && /^[a-f0-9]{48}$/.test(token) ? token : null;
};

const isValidObjectId = (id) => typeof id === "string" && /^[a-f0-9]{24}$/i.test(id) && mongoose.Types.ObjectId.isValid(id);

// Remove control characters (keep newlines/tabs), normalise whitespace.
const sanitizeMessage = (value) =>
  value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/**
 * Load a conversation only if the caller owns it. Returns null otherwise.
 */
const findOwnedConversation = async (conversationId, req) => {
  if (!isValidObjectId(conversationId)) return null;

  const conversation = await ChatConversation.findById(conversationId).select("+guestTokenHash");
  if (!conversation) return null;

  if (req.user?.userId) {
    return conversation.user && String(conversation.user) === req.user.userId ? conversation : null;
  }

  // Guest: must not be a customer conversation and must present the matching token.
  const token = getGuestToken(req);
  if (conversation.user || !token || !conversation.guestTokenHash) return null;

  const expected = Buffer.from(conversation.guestTokenHash, "hex");
  const actual = Buffer.from(hashToken(token), "hex");

  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual) ? conversation : null;
};

// Only keep cards for products the assistant actually linked or named.
const selectCards = (reply, cards) => {
  if (!cards.length) return [];

  const linkedIds = [...reply.matchAll(/\/product\/([a-f0-9]{24})/gi)].map((m) => m[1].toLowerCase());
  const byId = new Map(cards.map((c) => [c._id.toLowerCase(), c]));

  const selected = [];
  const seen = new Set();

  linkedIds.forEach((id) => {
    if (byId.has(id) && !seen.has(id)) {
      seen.add(id);
      selected.push(byId.get(id));
    }
  });

  if (!selected.length) {
    const lowerReply = reply.toLowerCase();
    cards.forEach((c) => {
      if (c.name && lowerReply.includes(c.name.toLowerCase()) && !seen.has(c._id)) {
        seen.add(c._id);
        selected.push(c);
      }
    });
  }

  return selected.slice(0, MAX_CARDS);
};

const publicMessage = (m) => ({
  id: String(m._id),
  role: m.role,
  content: m.content,
  products: m.products || [],
  requiresLogin: !!m.requiresLogin,
  createdAt: m.createdAt,
});

// =====================================================
// POST /api/chatbot/message
// =====================================================
const SendMessage = async (req, res) => {
  const { message, conversationId } = req.body || {};

  // ---------- validation ----------
  if (typeof message !== "string") {
    return res.status(400).json({ success: false, code: "INVALID_MESSAGE", message: "Message is required." });
  }

  const text = sanitizeMessage(message);

  if (!text) {
    return res.status(400).json({ success: false, code: "INVALID_MESSAGE", message: "Please type a message." });
  }

  if (text.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({
      success: false,
      code: "MESSAGE_TOO_LONG",
      message: `Messages can be up to ${MAX_MESSAGE_LENGTH} characters.`,
    });
  }

  if (conversationId !== undefined && conversationId !== null && conversationId !== "" && !isValidObjectId(conversationId)) {
    return res.status(400).json({ success: false, code: "INVALID_CONVERSATION", message: "Invalid conversation." });
  }

  const userId = req.user?.userId || null; // from verified JWT only
  let conversation = null;
  let newGuestToken = null;

  try {
    if (conversationId) {
      conversation = await findOwnedConversation(conversationId, req);

      if (!conversation) {
        return res.status(404).json({
          success: false,
          code: "CONVERSATION_NOT_FOUND",
          message: "This conversation is no longer available. Please start a new one.",
        });
      }
    }

    const lockKey = conversation ? `c:${conversation._id}` : `n:${userId || getGuestToken(req) || req.ip}`;

    if (inFlight.has(lockKey)) {
      return res.status(429).json({
        success: false,
        code: "REQUEST_IN_PROGRESS",
        message: "Please wait for the previous reply.",
      });
    }

    inFlight.add(lockKey);

    try {
      const history = conversation
        ? conversation.messages.slice(-MAX_CONTEXT_MESSAGES).map((m) => ({
            role: m.role,
            content: m.content.slice(0, MAX_CONTEXT_CHARS_PER_MESSAGE),
          }))
        : [];

      const result = await generateReply({ history, message: text, context: { userId } });

      const cards = selectCards(result.reply, result.productCards);

      // ---------- persist ----------
      if (!conversation) {
        const doc = { user: userId, messages: [], expiresAt: expiryFor(!!userId) };

        if (!userId) {
          newGuestToken = crypto.randomBytes(24).toString("hex");
          doc.guestTokenHash = hashToken(newGuestToken);
        }

        conversation = new ChatConversation(doc);
      }

      const now = new Date();

      conversation.messages.push({ role: "user", content: text, createdAt: now });
      conversation.messages.push({
        role: "assistant",
        content: result.reply.slice(0, 8000),
        products: cards.length ? cards : undefined,
        requiresLogin: result.requiresLogin || undefined,
        createdAt: new Date(),
      });

      if (conversation.messages.length > MAX_STORED_MESSAGES) {
        conversation.messages = conversation.messages.slice(-MAX_STORED_MESSAGES);
      }

      conversation.lastActivityAt = now;
      conversation.expiresAt = expiryFor(!!conversation.user);

      await conversation.save();

      const assistantMessage = conversation.messages[conversation.messages.length - 1];

      return res.status(200).json({
        success: true,
        conversationId: String(conversation._id),
        ...(newGuestToken ? { guestToken: newGuestToken } : {}),
        reply: assistantMessage.content,
        products: cards,
        requiresLogin: !!result.requiresLogin,
        message: publicMessage(assistantMessage),
      });
    } finally {
      inFlight.delete(lockKey);
    }
  } catch (err) {
    if (err instanceof ChatbotError) {
      return res.status(err.status).json({ success: false, code: err.code, message: err.message });
    }

    // Never leak internal error details to the client.
    console.error("Chatbot SendMessage error:", err.message);
    return res.status(500).json({
      success: false,
      code: "SERVER_ERROR",
      message: "Something went wrong. Please try again.",
    });
  }
};

// =====================================================
// GET /api/chatbot/conversations/:id
// =====================================================
const GetConversation = async (req, res) => {
  try {
    const conversation = await findOwnedConversation(req.params.id, req);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        code: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found.",
      });
    }

    return res.status(200).json({
      success: true,
      conversationId: String(conversation._id),
      messages: conversation.messages.slice(-40).map(publicMessage),
    });
  } catch (err) {
    console.error("Chatbot GetConversation error:", err.message);
    return res.status(500).json({ success: false, code: "SERVER_ERROR", message: "Something went wrong." });
  }
};

module.exports = { SendMessage, GetConversation, _internal: { selectCards, sanitizeMessage } };
