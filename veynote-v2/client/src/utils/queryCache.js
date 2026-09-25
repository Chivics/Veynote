export function createQueryCache({ maxEntries = 60, staleMs = 30000 } = {}) {
  const entries = new Map(); const pending = new Map(); const listeners = new Set();
  let generation = 0;
  const emit = key => listeners.forEach(listener => listener(key));
  return {
    peek: key => entries.get(key)?.data,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    clear() { generation++; entries.clear(); pending.clear(); emit(null); },
    async get(key, fetcher, force = false) {
      const entry = entries.get(key);
      if (!force && entry && Date.now() - entry.time < staleMs) return entry.data;
      if (pending.has(key)) return pending.get(key);
      const started = generation;
      const request = Promise.resolve().then(fetcher).then(data => {
        if (started === generation) {
          entries.delete(key); entries.set(key, { data, time: Date.now() });
          while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
          emit(key);
        }
        return data;
      }).finally(() => { if (pending.get(key) === request) pending.delete(key); });
      pending.set(key, request); return request;
    },
  };
}

export function cacheablePath(path) {
  const url = new URL(path, "https://cache.invalid");
  if (url.searchParams.get("scope") === "locked") return false;
  return /^(\/notes(?:\/meta\/tags)?|\/folders|\/accounts|\/calendar(?:\/day)?|\/analytics\/(?:trading|notes)|\/trading\/entries|\/trading-rules|\/tasks|\/library(?:\/[a-z_-]+)?|\/files(?:\/[a-zA-Z0-9_-]+)?|\/business\/workspaces|\/business\/[a-zA-Z0-9_-]+\/(?:overview|customers(?:\/[a-zA-Z0-9_-]+)?|opportunities|follow-ups))$/.test(url.pathname);
}
