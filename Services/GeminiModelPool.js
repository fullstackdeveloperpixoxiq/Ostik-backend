/*
  Gemini model pool for the customer chatbot.

  No single Gemini model is hardcoded. Availability of individual models
  changes over time (retired models return 404, popular ones return 503
  "high demand" or hang), so the chatbot:

  1. Discovers the Flash text models this API key can call (models.list),
     refreshed every few hours.
  2. Optionally puts GEMINI_MODEL (comma-separated) first as a preference.
  3. Tracks the health of every model: latency of successful calls, and a
     cool-down after failures (longer for "model not found").
  4. Hands out candidates ordered by health/speed so each request starts
     with the model most likely to answer quickly.
  5. Probes models in the background (tiny request) at startup and
     periodically re-checks models that are cooling down.
*/

const DISCOVERY_TTL_MS = 6 * 60 * 60 * 1000; // refresh model list every 6h
const DISCOVERY_RETRY_MS = 30 * 1000; // after a failed listing
const NOT_FOUND_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const BASE_COOLDOWN_MS = 60 * 1000;
const MAX_COOLDOWN_MS = 15 * 60 * 1000;
const PROBE_TIMEOUT_MS = 8000;
const PROBE_INTERVAL_MS = 20 * 60 * 1000;

// Text-chat Flash models only (skip image/audio/live/preview/experimental variants)
const EXCLUDE = /(image|tts|audio|live|omni|preview|exp|embedding|vision|veo|imagen|lyria|robotics|computer|thinking)/i;

const state = {
  discovered: [], // ordered model names
  discoveredAt: 0,
  discoveryFailedAt: 0,
  discovering: null,
  health: new Map(), // name -> { ok, latencyMs, failures, cooldownUntil, lastError }
  probeTimer: null,
  probing: null, // promise while a health check is running
};

const preferredModels = () =>
  (process.env.GEMINI_MODEL || "")
    .split(",")
    .map((m) => m.trim().replace(/^models\//, ""))
    .filter(Boolean);

// "gemini-3.5-flash-lite" -> [3, 5]
const versionOf = (name) => {
  const match = name.match(/(\d+)(?:\.(\d+))?/);
  return match ? [Number(match[1]), Number(match[2] || 0)] : [0, 0];
};

const sortByVersion = (a, b) => {
  const [a1, a2] = versionOf(a);
  const [b1, b2] = versionOf(b);
  if (a1 !== b1) return b1 - a1;
  if (a2 !== b2) return b2 - a2;
  return Number(/lite/i.test(a)) - Number(/lite/i.test(b)); // full model before lite
};

const healthOf = (name) => {
  if (!state.health.has(name)) {
    state.health.set(name, { ok: null, latencyMs: null, failures: 0, cooldownUntil: 0, lastError: null });
  }
  return state.health.get(name);
};

const discover = async (client) => {
  const fresh = Date.now() - state.discoveredAt < DISCOVERY_TTL_MS && state.discovered.length;
  if (fresh) return state.discovered;
  if (Date.now() - state.discoveryFailedAt < DISCOVERY_RETRY_MS && state.discovered.length) return state.discovered;
  if (state.discovering) return state.discovering;

  state.discovering = (async () => {
    try {
      const names = [];
      const pager = await client.models.list({ config: { pageSize: 100 } });

      for await (const model of pager) {
        const name = String(model.name || "").replace(/^models\//, "");
        const actions = model.supportedActions || [];
        if (/flash/i.test(name) && actions.includes("generateContent") && !EXCLUDE.test(name)) {
          names.push(name);
        }
      }

      if (names.length) {
        state.discovered = [...new Set(names)].sort(sortByVersion);
        state.discoveredAt = Date.now();
        console.log(`Chatbot: ${state.discovered.length} Gemini Flash models available.`);
      }
    } catch (err) {
      state.discoveryFailedAt = Date.now();
      console.error("Chatbot: could not list Gemini models:", err?.status || "", String(err?.message || "").slice(0, 120));
    } finally {
      state.discovering = null;
    }

    return state.discovered;
  })();

  return state.discovering;
};

/**
 * Ordered list of models to try for the next request.
 */
const getCandidates = async (client) => {
  const discovered = await discover(client);

  // Right after start-up no model is known to work yet: wait (bounded) for the
  // parallel health check instead of guessing and hitting a hanging model.
  const anyKnownGood = [...state.health.values()].some((h) => h.ok === true);
  if (!anyKnownGood && state.probing) {
    await Promise.race([state.probing, new Promise((r) => setTimeout(r, PROBE_TIMEOUT_MS + 500))]);
  }
  const preferred = preferredModels();
  const all = [...new Set([...preferred, ...discovered])];
  const now = Date.now();

  const available = all.filter((name) => healthOf(name).cooldownUntil <= now);

  const rank = (name) => {
    const h = healthOf(name);
    const preferredIndex = preferred.indexOf(name);
    return {
      name,
      // 0 = known good, 1 = untested, 2 = has failed before (cool-down expired)
      tier: h.ok === true ? 0 : h.ok === null ? 1 : 2,
      preferred: preferredIndex === -1 ? Infinity : preferredIndex,
      latency: h.latencyMs ?? Infinity,
      order: all.indexOf(name),
    };
  };

  const ordered = available
    .map(rank)
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        a.preferred - b.preferred ||
        a.latency - b.latency ||
        a.order - b.order
    )
    .map((r) => r.name);

  if (ordered.length) return ordered;

  // Everything is cooling down: try the ones that recover soonest
  // (excluding models that do not exist for this key).
  return all
    .filter((name) => healthOf(name).lastError !== "NOT_FOUND")
    .sort((a, b) => healthOf(a).cooldownUntil - healthOf(b).cooldownUntil)
    .slice(0, 2);
};

const markSuccess = (name, latencyMs) => {
  const h = healthOf(name);
  h.ok = true;
  h.failures = 0;
  h.cooldownUntil = 0;
  h.lastError = null;
  // exponential moving average of latency
  h.latencyMs = h.latencyMs == null ? latencyMs : Math.round(h.latencyMs * 0.7 + latencyMs * 0.3);
};

const markFailure = (name, kind) => {
  const h = healthOf(name);
  h.ok = false;
  h.failures += 1;
  h.lastError = kind;
  h.cooldownUntil =
    Date.now() +
    (kind === "NOT_FOUND"
      ? NOT_FOUND_COOLDOWN_MS
      : Math.min(BASE_COOLDOWN_MS * 2 ** (h.failures - 1), MAX_COOLDOWN_MS));
};

/**
 * Background health check with a tiny request. Never throws.
 * `classify(err)` maps an SDK error to a failure kind.
 */
const probeOne = async (client, name, classify) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const started = Date.now();

  try {
    await client.models.generateContent({
      model: name,
      contents: "Reply with OK.",
      config: { abortSignal: controller.signal, maxOutputTokens: 256 },
    });
    markSuccess(name, Date.now() - started);
  } catch (err) {
    markFailure(name, controller.signal.aborted ? "TIMEOUT" : classify(err));
  } finally {
    clearTimeout(timer);
  }
};

// All models are checked in parallel, so ranking is ready within PROBE_TIMEOUT_MS.
const probe = (client, names, classify) => Promise.all(names.map((name) => probeOne(client, name, classify)));

const startBackgroundProbe = (getClient, classify) => {
  if (state.probeTimer || process.env.CHATBOT_MODEL_PROBE === "false") return;

  const runInner = async (onlyUnhealthy) => {
    try {
      const client = getClient();
      const names = await discover(client);
      const all = [...new Set([...preferredModels(), ...names])];
      const targets = onlyUnhealthy
        ? all.filter((n) => healthOf(n).ok !== true && healthOf(n).lastError !== "NOT_FOUND")
        : all;
      await probe(client, targets, classify);

      const ready = all.filter((n) => healthOf(n).ok);
      if (!onlyUnhealthy) {
        console.log(`Chatbot: Gemini models ready: ${ready.length ? ready.join(", ") : "none right now"}`);
      }
    } catch {
      // not configured (no API key) or network issue: ignore, requests will report it
    }
  };

  // `state.probing` covers discovery + checks so early requests can wait for it.
  const run = (onlyUnhealthy) => {
    if (state.probing) return state.probing;
    state.probing = runInner(onlyUnhealthy).finally(() => {
      state.probing = null;
    });
    return state.probing;
  };

  run(false);
  state.probeTimer = setInterval(() => run(true), PROBE_INTERVAL_MS);
  state.probeTimer.unref?.();
};

const snapshot = () =>
  [...state.health.entries()].map(([name, h]) => ({
    name,
    ok: h.ok,
    latencyMs: h.latencyMs,
    coolingDown: h.cooldownUntil > Date.now(),
    lastError: h.lastError,
  }));

const isKnownGood = (name) => healthOf(name).ok === true;

module.exports = { getCandidates, markSuccess, markFailure, startBackgroundProbe, snapshot, isKnownGood };
