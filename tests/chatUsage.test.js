/*
  AI chatbot usage-limit tests.
  Runs against an in-memory MongoDB (replica set) and a mocked Gemini service,
  so no real database or API key is touched.

    npm test
*/
const { test, before, after, beforeEach, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

process.env.JWT_SECRET = "test-secret";
process.env.CHATBOT_RATE_LIMIT_PER_MINUTE = "10000";
process.env.CHATBOT_RATE_LIMIT_PER_DAY = "10000";
process.env.CHATBOT_DEFAULT_MONTHLY_LIMIT = "100";
process.env.CHATBOT_USAGE_TZ_OFFSET_MINUTES = "330";

// ---- mock Gemini before anything loads it ----
const geminiPath = require.resolve(path.join(__dirname, "..", "Services", "GeminiService.js"));
class ChatbotError extends Error {
  constructor(code, message, status = 503) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
const gemini = { calls: 0, fail: false, delayMs: 0, last: null };
require.cache[geminiPath] = {
  id: geminiPath,
  filename: geminiPath,
  loaded: true,
  exports: {
    ChatbotError,
    startModelHealthChecks: () => {},
    generateReply: async (args) => {
      const { message } = args;
      gemini.calls += 1;
      gemini.last = args;
      if (gemini.delayMs) await new Promise((r) => setTimeout(r, gemini.delayMs));
      if (gemini.fail) throw new ChatbotError("AI_UNAVAILABLE", "The assistant is busy.", 503);
      return {
        reply: `Echo: ${message}`,
        productCards: [],
        requiresLogin: false,
        tokens: { model: "test-model", inputTokens: 120, outputTokens: 30, totalTokens: 150, calls: 1 },
      };
    },
  },
};

const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

const User = require("../models/UserSchema");
const ChatUsageModel = require("../models/ChatUsageSchema");
const ChatbotSettings = require("../models/ChatbotSettingsSchema");
const ChatUsage = require("../Services/ChatUsageService");

let mongo;
let app;

const customerToken = (u) => jwt.sign({ userId: String(u._id), role: "user" }, process.env.JWT_SECRET);
const adminToken = () => jwt.sign({ id: new mongoose.Types.ObjectId().toString(), role: "admin" }, process.env.JWT_SECRET);

let n = 0;
const makeUser = (extra = {}) =>
  User.create({ name: `Customer ${++n}`, email: `c${n}@example.com`, password: "x", ...extra });

const send = (token, message = "hello", conversationId) =>
  request(app)
    .post("/api/chatbot/message")
    .set("Authorization", `Bearer ${token}`)
    .send({ message, ...(conversationId ? { conversationId } : {}) });

const setDefaultLimit = (defaultMonthlyLimit, usageLimitsEnabled = true) =>
  ChatbotSettings.findOneAndUpdate(
    { key: "global" },
    { $set: { defaultMonthlyLimit, usageLimitsEnabled } },
    { upsert: true }
  );

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), ChatUsageModel.init(), ChatbotSettings.init()]);

  app = express();
  app.use(express.json());
  app.use("/api/chatbot", require("../Routes/ChatbotRoutes"));
  app.use("/api/admin", require("../Routes/AdminRoutes"));
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(async () => {
  gemini.calls = 0;
  gemini.fail = false;
  gemini.delayMs = 0;
  await Promise.all([ChatUsageModel.deleteMany({}), ChatbotSettings.deleteMany({})]);
});

// ---------------------------------------------------------------------------
describe("periods", () => {
  test("calendar month in IST, end exclusive", () => {
    // 2026-11-30 19:00 UTC = 2026-12-01 00:30 IST -> December
    const p = ChatUsage.getPeriod(new Date("2026-11-30T19:00:00Z"));
    assert.equal(p.period, "2026-12");
    assert.equal(p.periodStart.toISOString(), "2026-11-30T18:30:00.000Z");
    assert.equal(p.periodEnd.toISOString(), "2026-12-31T18:30:00.000Z");

    // 2026-11-30 18:00 UTC = 23:30 IST -> still November
    assert.equal(ChatUsage.getPeriod(new Date("2026-11-30T18:00:00Z")).period, "2026-11");
  });

  test("monthly reset: new month starts at zero and keeps old record", async () => {
    const u = await makeUser();
    const r = await ChatUsage.reserve(u._id, new Date("2026-10-15T10:00:00Z"));
    await ChatUsage.commit(r);

    const nov = await ChatUsage.getUsage(u._id, new Date("2026-11-02T10:00:00Z"));
    assert.equal(nov.messagesUsed, 0);
    const oct = await ChatUsage.getUsage(u._id, new Date("2026-10-20T10:00:00Z"));
    assert.equal(oct.messagesUsed, 1);
    assert.equal(await ChatUsageModel.countDocuments({ user: u._id }), 1); // Nov doc is only created on use
  });
});

// ---------------------------------------------------------------------------
describe("customer usage", () => {
  test("new customer is initialised with zero usage and the default limit", async () => {
    const u = await makeUser();
    const res = await request(app).get("/api/chatbot/usage").set("Authorization", `Bearer ${customerToken(u)}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.messagesUsed, 0);
    assert.equal(res.body.messageLimit, 100);
    assert.equal(res.body.messagesRemaining, 100);
    assert.equal(res.body.usagePercentage, 0);
    assert.equal(res.body.isLimitReached, false);
    assert.ok(res.body.periodStart && res.body.periodEnd);
  });

  test("usage endpoint requires login", async () => {
    const res = await request(app).get("/api/chatbot/usage");
    assert.equal(res.status, 401);
  });

  test("successful messages are counted once each and returned in the reply", async () => {
    const u = await makeUser();
    const t = customerToken(u);

    const first = await send(t, "one");
    assert.equal(first.status, 200);
    assert.equal(first.body.usage.messagesUsed, 1);

    const second = await send(t, "two", first.body.conversationId);
    assert.equal(second.status, 200);
    assert.equal(second.body.usage.messagesUsed, 2);
    assert.equal(second.body.usage.messagesRemaining, 98);
    assert.equal(second.body.usage.usagePercentage, 2);

    const usage = await request(app).get("/api/chatbot/usage").set("Authorization", `Bearer ${t}`);
    assert.equal(usage.body.messagesUsed, 2);
  });

  test("failed Gemini requests are not counted", async () => {
    const u = await makeUser();
    gemini.fail = true;

    const res = await send(customerToken(u));
    assert.equal(res.status, 503);

    const usage = await ChatUsage.getUsage(u._id);
    assert.equal(usage.messagesUsed, 0);
    const doc = await ChatUsageModel.findOne({ user: u._id }).lean();
    assert.equal(doc.pending.length, 0, "reservation released");
  });

  test("limit reached -> 429 with usage + reset date, Gemini not called", async () => {
    await setDefaultLimit(2);
    const u = await makeUser();
    const t = customerToken(u);

    const a = await send(t, "a");
    await send(t, "b", a.body.conversationId);
    const before = gemini.calls;

    const blocked = await send(t, "c", a.body.conversationId);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.code, "USAGE_LIMIT_REACHED");
    assert.equal(blocked.body.usage.isLimitReached, true);
    assert.equal(blocked.body.usage.messagesUsed, 2);
    assert.ok(blocked.body.resetsAt);
    assert.equal(gemini.calls, before, "Gemini must not be called");

    // History is still readable
    const conv = await request(app)
      .get(`/api/chatbot/conversations/${a.body.conversationId}`)
      .set("Authorization", `Bearer ${t}`);
    assert.equal(conv.status, 200);
    assert.equal(conv.body.messages.length, 4);
  });

  test("one global limit applies to every customer; per-customer fields are ignored", async () => {
    await setDefaultLimit(2);
    // A leftover per-customer value in the database must not grant extra messages.
    const u = await makeUser();
    await User.collection.updateOne({ _id: u._id }, { $set: { chatbotMonthlyLimit: 50 } });
    const other = await makeUser();

    for (const usr of [u, other]) {
      const t = customerToken(usr);
      const a = await send(t, "1");
      const b = await send(t, "2", a.body.conversationId);
      assert.equal(b.status, 200);
      assert.equal(b.body.usage.messageLimit, 2);
      assert.equal(b.body.usage.isCustomLimit, undefined);
      assert.equal((await send(t, "3", a.body.conversationId)).status, 429);
    }
  });

  test("Gemini tokens are recorded for cost monitoring but never used as credits", async () => {
    await setDefaultLimit(1);
    const u = await makeUser();
    const t = customerToken(u);
    const a = await send(t, "1");
    assert.equal(a.status, 200);
    assert.equal(a.body.usage.messagesUsed, 1); // one message, regardless of 150 tokens
    assert.equal(a.body.message.tokens, undefined, "tokens are not exposed to customers");
    assert.equal(a.body.usage.gemini, undefined);

    const doc = await ChatUsageModel.findOne({ user: u._id }).lean();
    assert.deepEqual(doc.gemini, { inputTokens: 120, outputTokens: 30, totalTokens: 150, calls: 1 });
    assert.equal((await send(t, "2", a.body.conversationId)).status, 429);
  });

  test("limits disabled -> unlimited but still tracked", async () => {
    await setDefaultLimit(1, false);
    const u = await makeUser();
    const t = customerToken(u);
    const a = await send(t, "1");
    const b = await send(t, "2", a.body.conversationId);
    assert.equal(b.status, 200);
    assert.equal(b.body.usage.messagesUsed, 2);
    assert.equal(b.body.usage.messageLimit, null);
    assert.equal(b.body.usage.isLimitReached, false);
  });

  test("usage persists across logout/login (new token, same account)", async () => {
    const u = await makeUser();
    await send(customerToken(u), "hi");

    const newSessionToken = jwt.sign({ userId: String(u._id), role: "user", iat: Math.floor(Date.now() / 1000) + 5 }, process.env.JWT_SECRET);
    const res = await request(app).get("/api/chatbot/usage").set("Authorization", `Bearer ${newSessionToken}`);
    assert.equal(res.body.messagesUsed, 1);
  });

  test("guests are not affected by the customer quota", async () => {
    await setDefaultLimit(0);
    const res = await request(app).post("/api/chatbot/message").send({ message: "hi" });
    assert.equal(res.status, 200);
    assert.equal(res.body.usage, undefined);
  });
});

// ---------------------------------------------------------------------------
describe("concurrency", () => {
  test("parallel reservations never exceed the limit", async () => {
    await setDefaultLimit(5);
    const u = await makeUser();

    const results = await Promise.allSettled(Array.from({ length: 25 }, () => ChatUsage.reserve(u._id)));
    const ok = results.filter((r) => r.status === "fulfilled");
    assert.equal(ok.length, 5);

    await Promise.all(ok.map((r) => ChatUsage.commit(r.value)));
    const usage = await ChatUsage.getUsage(u._id);
    assert.equal(usage.messagesUsed, 5);
    assert.equal(usage.isLimitReached, true);
    assert.equal(await ChatUsageModel.countDocuments({ user: u._id }), 1, "no duplicate usage records");
  });

  test("parallel HTTP requests across conversations stay within the limit", async () => {
    await setDefaultLimit(3);
    const u = await makeUser();
    const t = customerToken(u);

    // Create 6 separate conversations while unlimited, then cap and fire in parallel.
    await setDefaultLimit(1000);
    const convs = [];
    for (let i = 0; i < 6; i++) convs.push((await send(t, `seed ${i}`)).body.conversationId);
    await ChatUsageModel.updateMany({ user: u._id }, { $set: { messagesUsed: 0 } });
    await setDefaultLimit(3);

    gemini.delayMs = 50;
    const responses = await Promise.all(convs.map((c) => send(t, "parallel", c)));
    const ok = responses.filter((r) => r.status === 200).length;
    const blocked = responses.filter((r) => r.status === 429).length;

    assert.equal(ok, 3);
    assert.equal(blocked, 3);
    assert.equal((await ChatUsage.getUsage(u._id)).messagesUsed, 3);
  });

  test("abandoned reservations expire", async () => {
    await setDefaultLimit(1);
    const u = await makeUser();
    const t0 = new Date();
    await ChatUsage.reserve(u._id, t0); // never committed / released

    await assert.rejects(ChatUsage.reserve(u._id, new Date(t0.getTime() + 1000)));
    const later = await ChatUsage.reserve(u._id, new Date(t0.getTime() + 4 * 60 * 1000));
    assert.ok(later.id);
  });
});

// ---------------------------------------------------------------------------
describe("admin", () => {
  test("customers cannot access admin endpoints", async () => {
    const u = await makeUser();
    const t = customerToken(u);
    for (const [method, url] of [
      ["get", "/api/admin/chatbot/settings"],
      ["put", "/api/admin/chatbot/settings"],
      ["get", "/api/admin/chatbot/stats"],
      ["get", "/api/admin/chatbot/usage"],
    ]) {
      const res = await request(app)[method](url).set("Authorization", `Bearer ${t}`).send({ defaultMonthlyLimit: 9999 });
      assert.equal(res.status, 403, `${method} ${url}`);
      const anon = await request(app)[method](url);
      assert.equal(anon.status, 401, `anon ${method} ${url}`);
    }
  });

  test("admin sets the global limit and sees usage + token stats", async () => {
    const a = adminToken();
    const u = await makeUser();
    const t = customerToken(u);

    const bad = await request(app).put("/api/admin/chatbot/settings").set("Authorization", `Bearer ${a}`).send({ defaultMonthlyLimit: -1 });
    assert.equal(bad.status, 400);

    const s = await request(app)
      .put("/api/admin/chatbot/settings")
      .set("Authorization", `Bearer ${a}`)
      .send({ defaultMonthlyLimit: 2, usageLimitsEnabled: true });
    assert.equal(s.status, 200);
    assert.equal(s.body.settings.defaultMonthlyLimit, 2);

    const c = await send(t, "1");
    await send(t, "2", c.body.conversationId);
    assert.equal((await send(t, "3", c.body.conversationId)).status, 429);

    const list = await request(app).get(`/api/admin/chatbot/usage?search=${encodeURIComponent(u.email)}`).set("Authorization", `Bearer ${a}`);
    assert.equal(list.status, 200);
    assert.equal(list.body.customers[0].messagesUsed, 2);
    assert.equal(list.body.customers[0].isLimitReached, true);

    const stats = await request(app).get("/api/admin/chatbot/stats").set("Authorization", `Bearer ${a}`);
    assert.equal(stats.status, 200);
    assert.ok(stats.body.stats.totalMessages >= 2);
    assert.ok(stats.body.stats.usersAtLimit >= 1);

    assert.equal(stats.body.stats.geminiTokens.customers.totalTokens >= 300, true);

    // Raising the global limit immediately applies to everyone.
    await request(app).put("/api/admin/chatbot/settings").set("Authorization", `Bearer ${a}`).send({ defaultMonthlyLimit: 3 });
    assert.equal((await send(t, "4", c.body.conversationId)).status, 200);

    // Per-customer allocation endpoints no longer exist.
    for (const [method, url] of [
      ["put", `/api/admin/chatbot/usage/${u._id}/limit`],
      ["post", `/api/admin/chatbot/usage/${u._id}/reset`],
      ["get", `/api/admin/chatbot/usage/${u._id}`],
    ]) {
      const res = await request(app)[method](url).set("Authorization", `Bearer ${a}`).send({ monthlyLimit: 500 });
      assert.equal(res.status, 404, `${method} ${url}`);
    }
  });
});

// ---------------------------------------------------------------------------
describe("chatbot settings", () => {
  const admin = () => `Bearer ${adminToken()}`;

  test("defaults are returned before anything is saved", async () => {
    await ChatbotSettings.deleteMany({});
    const res = await request(app).get("/api/admin/chatbot/settings").set("Authorization", admin());
    assert.equal(res.status, 200);
    const s = res.body.settings;
    assert.equal(s.enabled, true);
    assert.equal(s.assistantName, "Ostik AI Assistant");
    assert.equal(s.defaultMonthlyLimit, 100);
    assert.equal(s.usageLimitsEnabled, true);
    assert.equal(s.temperature, null);
    assert.equal(s.maxMessageLength, 1000);
    assert.equal(s.historyWindow, 12);
    assert.ok(s.suggestedQuestions.length > 0);
  });

  test("all fields save, persist and are used by the chatbot", async () => {
    const payload = {
      enabled: true,
      assistantName: "Ostik Helper",
      welcomeMessage: "Hello there",
      suggestedQuestions: ["Show offers", " Show offers ", "Track order"],
      additionalInstructions: "Be brief.",
      temperature: 0.4,
      maxOutputTokens: 1024,
      historyWindow: 4,
      maxMessageLength: 200,
      usageLimitsEnabled: true,
      defaultMonthlyLimit: 50,
    };
    const put = await request(app).put("/api/admin/chatbot/settings").set("Authorization", admin()).send(payload);
    assert.equal(put.status, 200);
    assert.deepEqual(put.body.settings.suggestedQuestions, ["Show offers", "Track order"]);

    const get = await request(app).get("/api/admin/chatbot/settings").set("Authorization", admin());
    for (const k of ["assistantName", "welcomeMessage", "additionalInstructions", "temperature", "maxOutputTokens", "historyWindow", "maxMessageLength", "defaultMonthlyLimit"]) {
      assert.equal(get.body.settings[k], payload[k], k);
    }

    const pub = await request(app).get("/api/chatbot/config");
    assert.equal(pub.status, 200);
    assert.deepEqual(Object.keys(pub.body.config).sort(), ["assistantName", "enabled", "maxMessageLength", "suggestedQuestions", "welcomeMessage"]);
    assert.equal(pub.body.config.assistantName, "Ostik Helper");

    const u = await makeUser();
    const t = customerToken(u);
    const ok = await send(t, "hi");
    assert.equal(ok.status, 200);
    assert.equal(ok.body.usage.messageLimit, 50);
    assert.equal(gemini.last.settings.temperature, 0.4);
    assert.equal(gemini.last.settings.assistantName, "Ostik Helper");

    // History window: 6 stored messages, only the last 4 are sent
    const c = ok.body.conversationId;
    await send(t, "two", c);
    await send(t, "three", c);
    assert.equal(gemini.last.history.length, 4);

    const tooLong = await send(t, "x".repeat(201), c);
    assert.equal(tooLong.status, 400);
    assert.equal(tooLong.body.code, "MESSAGE_TOO_LONG");

    // temperature can be reset to the model default
    const reset = await request(app).put("/api/admin/chatbot/settings").set("Authorization", admin()).send({ temperature: null });
    assert.equal(reset.body.settings.temperature, null);
  });

  test("invalid values are rejected and nothing is changed", async () => {
    await request(app).put("/api/admin/chatbot/settings").set("Authorization", admin()).send({ defaultMonthlyLimit: 100 });
    for (const bad of [
      { assistantName: "" },
      { temperature: 3 },
      { maxOutputTokens: 10 },
      { historyWindow: 1.5 },
      { defaultMonthlyLimit: -1 },
      { suggestedQuestions: ["1", "2", "3", "4", "5", "6", "7"] },
      { enabled: "yes" },
      {},
    ]) {
      const res = await request(app).put("/api/admin/chatbot/settings").set("Authorization", admin()).send(bad);
      assert.equal(res.status, 400, JSON.stringify(bad));
    }
    const get = await request(app).get("/api/admin/chatbot/settings").set("Authorization", admin());
    assert.equal(get.body.settings.defaultMonthlyLimit, 100);
  });

  test("disabling the assistant blocks messages without calling Gemini or counting usage", async () => {
    await request(app).put("/api/admin/chatbot/settings").set("Authorization", admin()).send({ enabled: false });
    const u = await makeUser();
    const res = await send(customerToken(u), "hi");
    assert.equal(res.status, 503);
    assert.equal(res.body.code, "CHATBOT_DISABLED");
    assert.equal(gemini.calls, 0);
    assert.equal((await ChatUsage.getUsage(u._id)).messagesUsed, 0);
    assert.equal((await request(app).get("/api/chatbot/config")).body.config.enabled, false);
    await request(app).put("/api/admin/chatbot/settings").set("Authorization", admin()).send({ enabled: true });
  });

  test("test playground runs the assistant without saving or counting", async () => {
    const before = await ChatUsageModel.countDocuments();
    const res = await request(app)
      .post("/api/admin/chatbot/test")
      .set("Authorization", admin())
      .send({ message: "hello", history: [{ role: "user", content: "hi" }, { role: "assistant", content: "Hey" }, { role: "system", content: "evil" }] });
    assert.equal(res.status, 200);
    assert.equal(res.body.answer, "Echo: hello");
    assert.equal(res.body.usage.totalTokens, 150);
    assert.equal(gemini.last.context.userId, null);
    assert.equal(gemini.last.history.length, 2);
    assert.equal(await ChatUsageModel.countDocuments(), before);

    const u = await makeUser();
    assert.equal((await request(app).post("/api/admin/chatbot/test").set("Authorization", `Bearer ${customerToken(u)}`).send({ message: "x" })).status, 403);
  });
});
