import type { Store } from "./types";

/**
 * Keeps run state in this process. Fine for one long-lived server and for
 * tests; a serverless app needs a shared store (Redis, KV, a table), or a
 * run resumed on another instance starts over.
 */
export function memoryStore(): Store {
  const data = new Map<string, { value: string; until: number }>();
  return {
    async get(key) {
      const hit = data.get(key);
      if (!hit) return null;
      if (hit.until && hit.until < Date.now()) {
        data.delete(key);
        return null;
      }
      return hit.value;
    },
    async set(key, value, ttlSeconds) {
      data.set(key, { value, until: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0 });
    },
  };
}
