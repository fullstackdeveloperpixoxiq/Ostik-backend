const crypto = require("crypto");
const mongoose = require("mongoose");

const ChatUsage = require("../models/ChatUsageSchema");
const ChatbotSettingsService = require("./ChatbotSettingsService");

/*
  AI CHATBOT USAGE / QUOTA SERVICE

  Flow for every customer message (see ChatbotController.SendMessage):
    1. reserve(userId)   -> atomically claims one slot or reports the limit is reached.
                            Gemini is NOT called when this fails.
    2. generate + save the reply
    3. commit(reservation)  on success  -> messagesUsed += 1
       release(reservation) on failure  -> slot is freed, nothing is counted

  Concurrency: the quota check and the reservation are a single
  findOneAndUpdate whose filter requires (messagesUsed + live pending) < limit,
  so N parallel requests can never claim more than the remaining slots, even
  across several server instances.

  Periods: calendar months in the store timezone, set with
  CHATBOT_USAGE_TZ_OFFSET_MINUTES (default 330 = IST, UTC+5:30). A new month
  simply uses a new (user, period) document, so usage resets automatically.
*/

const TZ_OFFSET_MIN = (() => {
  const n = Number(process.env.CHATBOT_USAGE_TZ_OFFSET_MINUTES);
  return Number.isFinite(n) && Math.abs(n) <= 14 * 60 ? n : 330;
})();

// A reservation older than this is treated as abandoned (crashed process).
// Must be longer than the longest possible chat request (frontend timeout is 70s).
const PENDING_STALE_MS = 3 * 60 * 1000;

const MAX_LIMIT = 100000;

class UsageLimitError extends Error {
  constructor(usage) {
    super(UsageLimitError.messageFor(usage));
    this.name = "UsageLimitError";
    this.status = 429;
    this.code = "USAGE_LIMIT_REACHED";
    this.usage = usage;
  }

  static messageFor(usage) {
    const base = "You've used all of your AI chat messages for this month.";
    if (!usage?.resetsAt) return base;
    // periodEnd is exclusive and the store's local midnight, so format it in store time.
    const local = new Date(new Date(usage.resetsAt).getTime() + TZ_OFFSET_MIN * 60 * 1000);
    const date = local.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    return `${base} Your allowance resets on ${date}.`;
  }
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

const getPeriod = (date = new Date()) => {
  const offsetMs = TZ_OFFSET_MIN * 60 * 1000;
  const local = new Date(date.getTime() + offsetMs);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();

  const periodStart = new Date(Date.UTC(year, month, 1) - offsetMs);
  const periodEnd = new Date(Date.UTC(year, month + 1, 1) - offsetMs); // exclusive

  return {
    period: `${year}-${String(month + 1).padStart(2, "0")}`,
    periodStart,
    periodEnd,
  };
};

// ---------------------------------------------------------------------------
// Settings / limits
// ---------------------------------------------------------------------------

// Settings live in ChatbotSettingsService (shared with the admin page and the chatbot).
const { getSettings, updateSettings, DEFAULTS } = ChatbotSettingsService;

/**
 * The single global monthly limit that applies to every customer.
 * `null` means unlimited (limits disabled). There are no per-customer limits.
 */
const resolveLimit = async (settings) => {
  const s = settings || (await getSettings());
  return { limit: s.usageLimitsEnabled ? s.defaultMonthlyLimit : null, settings: s };
};

// ---------------------------------------------------------------------------
// Usage documents
// ---------------------------------------------------------------------------

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

// Create the (user, period) document if missing. Safe under races thanks to the unique index.
const ensureUsageDoc = async (userId, p) => {
  try {
    await ChatUsage.updateOne(
      { user: toObjectId(userId), period: p.period },
      {
        $setOnInsert: {
          user: toObjectId(userId),
          period: p.period,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          messagesUsed: 0,
          pending: [],
        },
      },
      { upsert: true }
    );
  } catch (err) {
    if (err?.code !== 11000) throw err; // another request created it first
  }
};

const buildUsage = ({ messagesUsed, limit, p }) => {
  const used = Math.max(0, messagesUsed || 0);
  const unlimited = limit === null;
  const remaining = unlimited ? null : Math.max(0, limit - used);
  const percentage = unlimited ? 0 : limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 1000) / 10);

  return {
    messagesUsed: used,
    messageLimit: limit,
    messagesRemaining: remaining,
    usagePercentage: percentage,
    periodStart: p.periodStart.toISOString(),
    periodEnd: p.periodEnd.toISOString(),
    resetsAt: p.periodEnd.toISOString(),
    isLimitReached: !unlimited && used >= limit,
    limitsEnabled: !unlimited,
  };
};

/**
 * Current usage summary for one customer (no side effects besides creating
 * the month's record if it doesn't exist).
 */
const getUsage = async (userId, now = new Date()) => {
  const p = getPeriod(now);
  const { limit } = await resolveLimit();

  const doc = await ChatUsage.findOne({ user: toObjectId(userId), period: p.period })
    .select("messagesUsed")
    .lean();

  return buildUsage({ messagesUsed: doc?.messagesUsed || 0, limit, p });
};

/**
 * Atomically reserve one message slot. Throws UsageLimitError when the
 * customer has no messages left. Returns a reservation handle.
 */
const reserve = async (userId, now = new Date()) => {
  const p = getPeriod(now);
  const { limit } = await resolveLimit();
  const user = toObjectId(userId);

  await ensureUsageDoc(userId, p);

  // Drop abandoned reservations (e.g. the server restarted mid-request).
  const staleBefore = new Date(now.getTime() - PENDING_STALE_MS);
  await ChatUsage.updateOne(
    { user, period: p.period, "pending.at": { $lt: staleBefore } },
    { $pull: { pending: { at: { $lt: staleBefore } } } }
  );

  const id = crypto.randomBytes(12).toString("hex");

  const filter = { user, period: p.period };
  if (limit !== null) {
    filter.$expr = { $lt: [{ $add: ["$messagesUsed", { $size: "$pending" }] }, limit] };
  }

  const doc = await ChatUsage.findOneAndUpdate(
    filter,
    { $push: { pending: { id, at: now } } },
    { returnDocument: "after", projection: { messagesUsed: 1 } }
  ).lean();

  if (!doc) {
    const current = await ChatUsage.findOne({ user, period: p.period }).select("messagesUsed").lean();
    const usage = buildUsage({ messagesUsed: current?.messagesUsed || 0, limit, p });

    // Limit not reached but every remaining slot is held by in-flight requests.
    if (!usage.isLimitReached) {
      const err = new UsageLimitError(usage);
      err.code = "REQUEST_IN_PROGRESS";
      err.message = "Please wait for your previous message to finish.";
      throw err;
    }

    throw new UsageLimitError(usage);
  }

  return { id, userId: String(userId), period: p.period, p, limit };
};

const tokenInc = (tokens) => {
  const n = (v) => (Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
  return {
    "gemini.inputTokens": n(tokens?.inputTokens),
    "gemini.outputTokens": n(tokens?.outputTokens),
    "gemini.totalTokens": n(tokens?.totalTokens),
    "gemini.calls": n(tokens?.calls),
  };
};

/**
 * Count the reserved slot as a used message. Returns the updated usage.
 * The reservation is counted even if it was swept as stale in the meantime.
 * `tokens` (optional) is the Gemini consumption, recorded for cost monitoring only.
 */
const commit = async (reservation, tokens) => {
  const { id, userId, period, p, limit } = reservation;
  const user = toObjectId(userId);
  const now = new Date();
  const inc = { messagesUsed: 1, ...tokenInc(tokens) };

  let doc = await ChatUsage.findOneAndUpdate(
    { user, period, "pending.id": id },
    { $inc: inc, $pull: { pending: { id } }, $set: { lastMessageAt: now } },
    { returnDocument: "after", projection: { messagesUsed: 1 } }
  ).lean();

  if (!doc) {
    doc = await ChatUsage.findOneAndUpdate(
      { user, period },
      { $inc: inc, $set: { lastMessageAt: now } },
      { returnDocument: "after", projection: { messagesUsed: 1 } }
    ).lean();
  }

  return buildUsage({ messagesUsed: doc?.messagesUsed || 0, limit, p });
};

/** Free a reserved slot without counting it (failed request). */
const release = async (reservation) => {
  if (!reservation) return;
  try {
    await ChatUsage.updateOne(
      { user: toObjectId(reservation.userId), period: reservation.period },
      { $pull: { pending: { id: reservation.id } } }
    );
  } catch (err) {
    // The stale sweep will clean it up later.
    console.error("Chat usage release failed:", err.message);
  }
};

// ---------------------------------------------------------------------------
// Admin helpers
// ---------------------------------------------------------------------------

const resetUsage = async (userId, now = new Date()) => {
  const p = getPeriod(now);
  await ensureUsageDoc(userId, p);

  await ChatUsage.updateOne(
    { user: toObjectId(userId), period: p.period },
    { $set: { messagesUsed: 0, lastResetAt: now }, $inc: { resetCount: 1 } }
  );

  return getUsage(userId, now);
};

const isValidLimit = (value) => Number.isInteger(value) && value >= 0 && value <= MAX_LIMIT;

module.exports = {
  getPeriod,
  getSettings,
  updateSettings,
  resolveLimit,
  getUsage,
  reserve,
  commit,
  release,
  resetUsage,
  buildUsage,
  isValidLimit,
  UsageLimitError,
  MAX_LIMIT,
  DEFAULT_LIMIT: DEFAULTS.defaultMonthlyLimit,
};
