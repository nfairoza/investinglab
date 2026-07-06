import { serviceClient } from "@/lib/service-client";
import { isDailyStale } from "@/lib/daily-cache";

// Durable, app-wide server cache (P1.3). Two layers:
//   L1 — in-memory (fast, per serverless instance, lost on cold start)
//   L2 — server_cache table (survives cold starts, shared across instances)
//
// Reads check L1 first, then L2 (hydrating L1). Writes update both. Freshness is
// the shared 8am-ET/maxAge check from lib/daily-cache, so callers get the same
// "refresh each market morning" behavior whether the hit came from memory or DB.

interface Entry<T> { value: T; generatedAt: string }
const mem = new Map<string, Entry<unknown>>();

export interface CacheRead<T> { value: T | null; generatedAt: string | null; stale: boolean }

export async function readServerCache<T>(key: string, maxAgeMs?: number): Promise<CacheRead<T>> {
  const now = Date.now();
  const hit = mem.get(key) as Entry<T> | undefined;
  if (hit) {
    return { value: hit.value, generatedAt: hit.generatedAt, stale: isDailyStale(hit.generatedAt, maxAgeMs, now) };
  }
  const db = serviceClient();
  if (db) {
    const { data } = await db.from("server_cache").select("value, generated_at").eq("key", key).maybeSingle();
    if (data) {
      const entry: Entry<T> = { value: (data as any).value as T, generatedAt: (data as any).generated_at };
      mem.set(key, entry);
      return { value: entry.value, generatedAt: entry.generatedAt, stale: isDailyStale(entry.generatedAt, maxAgeMs, now) };
    }
  }
  return { value: null, generatedAt: null, stale: true };
}

export async function writeServerCache<T>(key: string, value: T): Promise<string> {
  const generatedAt = new Date().toISOString();
  mem.set(key, { value, generatedAt });
  const db = serviceClient();
  if (db) {
    await db.from("server_cache").upsert({ key, value: value as any, generated_at: generatedAt }, { onConflict: "key" });
  }
  return generatedAt;
}
