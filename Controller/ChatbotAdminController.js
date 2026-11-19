const UserSchema = require("../models/UserSchema");
const ChatUsageModel = require("../models/ChatUsageSchema");
const ChatConversation = require("../models/ChatConversationSchema");
const ChatUsage = require("../Services/ChatUsageService");
const ChatbotSettings = require("../Services/ChatbotSettingsService");
const { generateReply, ChatbotError } = require("../Services/GeminiService");

/*
  ADMIN – AI CHATBOT SETTINGS ("Limits & Privacy")
  All routes are mounted behind authMiddleware + AdminMiddleware (see AdminRoutes).

  One global limit applies to every customer. There are no per-customer
  allocations, credits or overrides.

  GET  /api/admin/chatbot/settings
  PUT  /api/admin/chatbot/settings   any subset of the Chatbot Settings fields
  POST /api/admin/chatbot/test       { message, history? } playground, nothing saved
  GET  /api/admin/chatbot/stats      message usage + internal Gemini token consumption
  GET  /api/admin/chatbot/usage      ?search=&page=&limit=&sort=usage|name   (read-only)
*/

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const serverError = (res, where, err) => {
  console.error(`Chatbot admin ${where} error:`, err.message);
  return res.status(500).json({ success: false, message: "Something went wrong." });
};

const emptyTokens = () => ({ inputTokens: 0, outputTokens: 0, totalTokens: 0, calls: 0 });

// GET /settings
const GetChatbotSettings = async (req, res) => {
  try {
    const settings = await ChatbotSettings.getSettings();
    return res.status(200).json({ success: true, settings, maxLimit: ChatUsage.MAX_LIMIT });
  } catch (err) {
    return serverError(res, "GetSettings", err);
  }
};

// PUT /settings  – partial update of any Chatbot Settings field
const UpdateChatbotSettings = async (req, res) => {
  try {
    const settings = await ChatbotSettings.updateSettings(req.body || {});
    return res.status(200).json({ success: true, message: "Chatbot settings saved.", settings });
  } catch (err) {
    if (err instanceof ChatbotSettings.SettingsValidationError) {
      return res.status(400).json({ success: false, message: err.message });
    }
    return serverError(res, "UpdateSettings", err);
  }
};

// POST /test  { message, history? }
// Runs the real assistant (Gemini + store tools) with the saved settings, as a
// guest. Nothing is saved and no customer usage is counted.
const TestChatbot = async (req, res) => {
  const { message, history } = req.body || {};
  const text = typeof message === "string" ? message.trim() : "";
  if (!text) return res.status(400).json({ success: false, message: "Please type a question." });

  try {
    const settings = await ChatbotSettings.getSettings();
    if (text.length > settings.maxMessageLength) {
      return res.status(400).json({ success: false, message: `Messages can be up to ${settings.maxMessageLength} characters.` });
    }

    const cleanHistory = (Array.isArray(history) ? history : [])
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-settings.historyWindow)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

    const started = Date.now();
    const result = await generateReply({ history: cleanHistory, message: text, context: { userId: null }, settings });

    return res.status(200).json({
      success: true,
      answer: result.reply,
      model: result.tokens?.model || null,
      latencyMs: Date.now() - started,
      usage: result.tokens || null,
      usedTools: !!result.usedTools,
      products: (result.productCards || []).slice(0, 6).map((p) => ({ _id: p._id, name: p.name })),
    });
  } catch (err) {
    if (err instanceof ChatbotError) return res.status(err.status || 503).json({ success: false, message: err.message });
    return serverError(res, "TestChatbot", err);
  }
};

// GET /stats
const GetChatbotStats = async (req, res) => {
  try {
    const p = ChatUsage.getPeriod();
    const settings = await ChatUsage.getSettings();
    const limit = settings.usageLimitsEnabled ? settings.defaultMonthlyLimit : null;

    const [current] = await ChatUsageModel.aggregate([
      { $match: { period: p.period } },
      {
        $group: {
          _id: null,
          totalMessages: { $sum: "$messagesUsed" },
          activeUsers: { $sum: { $cond: [{ $gt: ["$messagesUsed", 0] }, 1, 0] } },
          usersAtLimit: {
            $sum: { $cond: [{ $and: [limit !== null, { $gte: ["$messagesUsed", limit ?? 0] }] }, 1, 0] },
          },
          usersNearLimit: {
            $sum: {
              $cond: [
                {
                  $and: [
                    limit !== null && limit > 0,
                    { $gte: ["$messagesUsed", (limit ?? 0) * 0.8] },
                    { $lt: ["$messagesUsed", limit ?? 0] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          inputTokens: { $sum: { $ifNull: ["$gemini.inputTokens", 0] } },
          outputTokens: { $sum: { $ifNull: ["$gemini.outputTokens", 0] } },
          totalTokens: { $sum: { $ifNull: ["$gemini.totalTokens", 0] } },
          calls: { $sum: { $ifNull: ["$gemini.calls", 0] } },
        },
      },
    ]);

    // Guests have no monthly usage record; their token use lives on the
    // assistant messages of guest conversations.
    const [guest] = await ChatConversation.aggregate([
      { $match: { user: null, lastActivityAt: { $gte: p.periodStart } } },
      { $unwind: "$messages" },
      {
        $match: {
          "messages.role": "assistant",
          "messages.createdAt": { $gte: p.periodStart, $lt: p.periodEnd },
        },
      },
      {
        $group: {
          _id: null,
          messages: { $sum: 1 },
          inputTokens: { $sum: { $ifNull: ["$messages.tokens.inputTokens", 0] } },
          outputTokens: { $sum: { $ifNull: ["$messages.tokens.outputTokens", 0] } },
          totalTokens: { $sum: { $ifNull: ["$messages.tokens.totalTokens", 0] } },
          calls: { $sum: { $ifNull: ["$messages.tokens.calls", 0] } },
        },
      },
    ]);

    const history = await ChatUsageModel.aggregate([
      {
        $group: {
          _id: "$period",
          totalMessages: { $sum: "$messagesUsed" },
          activeUsers: { $sum: { $cond: [{ $gt: ["$messagesUsed", 0] }, 1, 0] } },
          totalTokens: { $sum: { $ifNull: ["$gemini.totalTokens", 0] } },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 6 },
      { $project: { _id: 0, period: "$_id", totalMessages: 1, activeUsers: 1, totalTokens: 1 } },
    ]);

    const totalMessages = current?.totalMessages || 0;
    const activeUsers = current?.activeUsers || 0;
    const pick = (src) =>
      src
        ? { inputTokens: src.inputTokens, outputTokens: src.outputTokens, totalTokens: src.totalTokens, calls: src.calls }
        : emptyTokens();
    const customerTokens = pick(current);
    const guestTokens = pick(guest);

    return res.status(200).json({
      success: true,
      stats: {
        period: p.period,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        totalMessages,
        activeUsers,
        averagePerActiveUser: activeUsers ? Math.round((totalMessages / activeUsers) * 10) / 10 : 0,
        usersAtLimit: current?.usersAtLimit || 0,
        usersNearLimit: current?.usersNearLimit || 0,
        guestMessages: guest?.messages || 0,
        // Internal cost monitoring only - not customer credits.
        geminiTokens: {
          customers: customerTokens,
          guests: guestTokens,
          total: {
            inputTokens: customerTokens.inputTokens + guestTokens.inputTokens,
            outputTokens: customerTokens.outputTokens + guestTokens.outputTokens,
            totalTokens: customerTokens.totalTokens + guestTokens.totalTokens,
            calls: customerTokens.calls + guestTokens.calls,
          },
        },
        history: history.reverse(),
      },
      settings,
    });
  } catch (err) {
    return serverError(res, "GetStats", err);
  }
};

// GET /usage  – read-only list of customers with their usage for the current month
const GetCustomerUsageList = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
    const sort = req.query.sort === "name" ? { name: 1 } : { messagesUsed: -1, name: 1 };

    const p = ChatUsage.getPeriod();
    const { limit: monthlyLimit, settings } = await ChatUsage.resolveLimit();

    const match = { role: "user" };
    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      match.$or = [{ name: rx }, { email: rx }];
    }

    const [result] = await UserSchema.aggregate([
      { $match: match },
      {
        $lookup: {
          from: ChatUsageModel.collection.name,
          let: { uid: "$_id" },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ["$user", "$$uid"] }, { $eq: ["$period", p.period] }] } } },
            { $project: { messagesUsed: 1, lastMessageAt: 1 } },
          ],
          as: "usage",
        },
      },
      {
        $addFields: {
          messagesUsed: { $ifNull: [{ $arrayElemAt: ["$usage.messagesUsed", 0] }, 0] },
          lastMessageAt: { $arrayElemAt: ["$usage.lastMessageAt", 0] },
        },
      },
      { $sort: sort },
      {
        $facet: {
          rows: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            { $project: { name: 1, email: 1, isActive: 1, messagesUsed: 1, lastMessageAt: 1 } },
          ],
          total: [{ $count: "count" }],
        },
      },
    ]);

    const customers = (result?.rows || []).map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      isActive: u.isActive !== false,
      lastMessageAt: u.lastMessageAt || null,
      ...ChatUsage.buildUsage({ messagesUsed: u.messagesUsed, limit: monthlyLimit, p }),
    }));

    const total = result?.total?.[0]?.count || 0;

    return res.status(200).json({
      success: true,
      customers,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      period: p.period,
      settings,
    });
  } catch (err) {
    return serverError(res, "GetCustomerUsageList", err);
  }
};

module.exports = {
  GetChatbotSettings,
  UpdateChatbotSettings,
  GetChatbotStats,
  GetCustomerUsageList,
  TestChatbot,
};
