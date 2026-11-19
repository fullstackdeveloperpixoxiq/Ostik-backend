// Small in-process TTL cache for near-static, non-business-critical data
// (category tree, hot-selling ranking). Never use it for prices or stock.
// Writes that change the cached data must call invalidate().

const store = new Map(); // key -> { value, expires }

const get = (key) => {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expires <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
};

const set = (key, value, ttlMs) => {
  store.set(key, { value, expires: Date.now() + ttlMs });
  return value;
};

// Cache the result of an async loader; concurrent callers share one load.
const inflight = new Map();
const wrap = async (key, ttlMs, loader) => {
  const cached = get(key);
  if (cached !== undefined) return cached;
  if (inflight.has(key)) return inflight.get(key);

  const promise = Promise.resolve()
    .then(loader)
    .then((value) => set(key, value, ttlMs))
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
};

const invalidate = (prefix) => {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
};

module.exports = { get, set, wrap, invalidate };
