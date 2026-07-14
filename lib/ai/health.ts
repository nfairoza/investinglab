import { readServerCache, writeServerCache } from "@/lib/server-cache";

// =============================================================================
// AIOPT A6 — AI provider health. Tracks per-provider last-success + consecutive
// failure streak so /connectors can show real status and /admin can banner when
// a configured provider has been failing >1h (a dead key silently rerouting all
// traffic to the other provider is a cost incident that must be VISIBLE).
//
// Durable in server_cache (survives cold starts), best-effort — a failure to
// record health never blocks an AI call.
// =============================================================================

export type AiProvider = "claude" | "gemini";

export interface ProviderHealth {
  provider: AiProvider;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  failStreak: number; // consecutive failures since the last success
  failingSince: string | null; // when the current failing streak began
}

const KEY = (p: AiProvider) => `ai:health:${p}`;

export async function noteProviderResult(provider: AiProvider, ok: boolean, error?: string, nowMs = Date.now()): Promise<void> {
  try {
    const now = new Date(nowMs).toISOString();
    const cur = (await readServerCache<ProviderHealth>(KEY(provider), Number.MAX_SAFE_INTEGER)).value;
    const h: ProviderHealth = cur ?? { provider, lastSuccessAt: null, lastErrorAt: null, lastError: null, failStreak: 0, failingSince: null };
    if (ok) {
      h.lastSuccessAt = now;
      h.failStreak = 0;
      h.failingSince = null;
    } else {
      h.lastErrorAt = now;
      h.lastError = (error ?? "unknown").slice(0, 200);
      h.failStreak += 1;
      if (!h.failingSince) h.failingSince = now;
    }
    await writeServerCache(KEY(provider), h);
  } catch { /* health is best-effort */ }
}

export async function readProviderHealth(provider: AiProvider): Promise<ProviderHealth | null> {
  try {
    return (await readServerCache<ProviderHealth>(KEY(provider), Number.MAX_SAFE_INTEGER)).value ?? null;
  } catch {
    return null;
  }
}

// A provider "failing >1h" = a current streak whose failingSince is older than 1h.
export function isFailingOverAnHour(h: ProviderHealth | null, nowMs = Date.now()): boolean {
  if (!h || h.failStreak === 0 || !h.failingSince) return false;
  return nowMs - Date.parse(h.failingSince) > 60 * 60 * 1000;
}

export async function readAllProviderHealth(): Promise<ProviderHealth[]> {
  const [c, g] = await Promise.all([readProviderHealth("claude"), readProviderHealth("gemini")]);
  return [c, g].filter((x): x is ProviderHealth => x != null);
}
