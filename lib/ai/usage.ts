import { serviceClient } from "@/lib/service-client";

// AI usage logging + cost estimation (P6.3). Best-effort and non-throwing — a
// logging failure must never break an AI call.

export interface AiUsageEntry {
  task: string;
  provider: "claude" | "gemini";
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  ok: boolean;
  userId?: string | null;
  estimated: boolean;
}

// Approx USD per 1M tokens (input, output). Rough public list prices — used only
// for a spend ESTIMATE on the admin dashboard, not billing. Update as pricing
// changes. Keyed by a substring match on the model id.
const PRICE_PER_MTOK: Array<{ match: RegExp; in: number; out: number }> = [
  { match: /opus/i, in: 15, out: 75 },
  { match: /sonnet/i, in: 3, out: 15 },
  { match: /haiku/i, in: 0.8, out: 4 },
  { match: /gemini.*pro|gemini-2\.5-pro/i, in: 1.25, out: 10 },
  { match: /gemini.*flash|flash-latest/i, in: 0.3, out: 2.5 },
];

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const row = PRICE_PER_MTOK.find((r) => r.match.test(model));
  if (!row) return 0;
  return (inputTokens / 1_000_000) * row.in + (outputTokens / 1_000_000) * row.out;
}

// Rough token estimate when a provider doesn't return usage (~4 chars/token).
export function approxTokens(text: string): number {
  return Math.max(1, Math.ceil((text?.length ?? 0) / 4));
}

export async function logAiUsage(e: AiUsageEntry): Promise<void> {
  try {
    const db = serviceClient();
    if (!db) return;
    await db.from("ai_usage").insert({
      task: e.task,
      provider: e.provider,
      model: e.model,
      input_tokens: e.inputTokens,
      output_tokens: e.outputTokens,
      latency_ms: e.latencyMs,
      ok: e.ok,
      user_id: e.userId ?? null,
      estimated: e.estimated,
    });
  } catch { /* never break the AI path on a logging failure */ }
}
