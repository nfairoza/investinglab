import { getRuntimeKey, getRuntimeModel, getRuntimeStrategy } from "./runtime-key";
import { callGemini, geminiKey, geminiModel } from "./gemini";

// AI provider layer. Primary = Anthropic Claude. Fallback = Google Gemini
// (used automatically when Anthropic is unreachable — e.g. AMD's network blocks
// api.anthropic.com but allows generativelanguage.googleapis.com).
// Key resolution: Settings runtime key -> ANTHROPIC_API_KEY -> AI_API_KEY.

export const DEFAULT_MODEL = "claude-sonnet-4-6";

export function resolveApiKey(): string | null {
  return (
    getRuntimeKey() ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.AI_API_KEY ||
    null
  );
}

export function resolveModel(): string {
  return getRuntimeModel() || process.env.AI_MODEL || DEFAULT_MODEL;
}

export type AiSource = "runtime" | "env" | "none";

// AI is "configured" if EITHER Claude or Gemini has a key. Also reports which
// providers are available + the active routing strategy so the UI can explain
// how tasks are routed.
export function aiStatus(): {
  configured: boolean;
  source: AiSource;
  model: string;
  hasClaude: boolean;
  hasGemini: boolean;
  strategy: string;
} {
  const hasClaude = Boolean(getRuntimeKey() || process.env.ANTHROPIC_API_KEY || process.env.AI_API_KEY);
  const hasGemini = Boolean(geminiKey());
  const strategy = (getRuntimeStrategy() || process.env.AI_STRATEGY || "smart").toLowerCase();
  const base = { hasClaude, hasGemini, strategy };
  if (getRuntimeKey()) return { configured: true, source: "runtime", model: resolveModel(), ...base };
  if (process.env.ANTHROPIC_API_KEY || process.env.AI_API_KEY) {
    return { configured: true, source: "env", model: resolveModel(), ...base };
  }
  if (hasGemini) return { configured: true, source: "env", model: geminiModel(), ...base };
  return { configured: false, source: "none", model: resolveModel(), ...base };
}

// Is a network/connectivity error (vs. an auth/HTTP error)? Used to decide
// whether to fall back to Gemini.
function isNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /Network error reaching|timeout|ETIMEDOUT| ENOTFOUND|ECONNREFUSED|fetch failed|UNABLE_TO_GET/i.test(msg);
}

// Unified text generation: try Claude, fall back to Gemini on a network failure
// or when no Claude key exists. Returns { text, provider } so callers can flag
// which AI answered.
export async function callAI(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  webSearch?: boolean;
}): Promise<{ text: string; provider: "claude" | "gemini" }> {
  const hasClaude = Boolean(resolveApiKey());
  if (hasClaude) {
    try {
      const text = await callClaude(opts);
      return { text, provider: "claude" };
    } catch (e) {
      // Only fall back on connectivity issues (not on auth/4xx) — and only if
      // Gemini is available.
      if (!geminiKey() || !isNetworkError(e)) throw e;
    }
  }
  if (!geminiKey()) throw new Error("No AI provider reachable (Claude blocked, no Gemini key).");
  const text = await callGemini({ system: opts.system, user: opts.user, webSearch: opts.webSearch });
  return { text, provider: "gemini" };
}

// Calls the Anthropic Messages API and returns the concatenated text output.
// Throws on missing key or a non-OK response so callers can degrade to
// "unavailable" rather than inventing analysis.
export async function callClaude(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const key = resolveApiKey();
  if (!key) throw new Error("No AI key configured");

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: resolveModel(),
        max_tokens: opts.maxTokens ?? 4096,
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
      }),
      cache: "no-store",
      // Don't hang forever if the network silently stalls — fail over to Gemini.
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e: any) {
    // Surface the real network cause (proxy/SSL/DNS) instead of bare "fetch failed".
    const cause = e?.cause?.message || e?.cause?.code || e?.message || "unknown";
    throw new Error(`Network error reaching api.anthropic.com: ${cause}. If you're on a corporate network, a proxy/SSL filter may be blocking it.`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Anthropic HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }

  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return (json.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n");
}
