// =============================================================================
// AIOPT A3 — chat history discipline. Stop resending everything each turn.
//
// - Sliding window: keep the last N turns verbatim.
// - Tool-result stubs: bodies of tool results older than the last 2 turns are
//   replaced with a one-line stub ("[transactions: 14 rows]") — the model rarely
//   needs stale row data verbatim, and that's where chat context bloats.
// - Hard cap: total request tokens ≤ a per-plan ceiling; trim oldest first,
//   never the system block (it's cached anyway, A2).
//
// Pure over the message array; the route applies it before the model call.
// =============================================================================

import { approxTokens } from "@/lib/ai/usage";

export interface HistMessage {
  role: "user" | "assistant";
  content: string;
  images?: { mediaType: string; data: string }[];
}

export const WINDOW_TURNS = 8;         // last N turns kept verbatim
export const STUB_AFTER_TURNS = 2;     // tool results older than this get stubbed
export const PLAN_TOKEN_CAP: Record<string, number> = { free: 6_000, premium: 16_000, pro: 32_000 };

// A tool-result-ish line inside assistant/user content we can shorten. In this
// app tool results are folded into the transcript as JSON-looking blobs; we
// detect a long JSON object/array and replace it with a compact stub.
const TOOL_JSON_RE = /\{[\s\S]{200,}\}|\[[\s\S]{200,}\]/;

function stubToolBlob(content: string): string {
  const m = content.match(TOOL_JSON_RE);
  if (!m) return content;
  const blob = m[0];
  // Try to summarize: count rows if it's an array of objects, else byte size.
  let summary = `${blob.length} chars`;
  try {
    const parsed = JSON.parse(blob);
    if (Array.isArray(parsed)) summary = `${parsed.length} rows`;
    else if (parsed && typeof parsed === "object") {
      const rows = (parsed.rows ?? parsed.data ?? parsed.items);
      if (Array.isArray(rows)) summary = `${rows.length} rows`;
      else summary = `${Object.keys(parsed).length} fields`;
    }
  } catch { /* not valid JSON — keep the byte summary */ }
  return content.replace(blob, `[tool result: ${summary}]`);
}

/**
 * Apply the sliding window + tool-result stubbing + per-plan token cap.
 * Returns the messages to send. The system prompt is NOT included here (it's
 * handled separately + cached); `systemTokens` is passed so the cap accounts
 * for it.
 */
export function prepareHistory(
  messages: HistMessage[],
  plan: string,
  systemTokens = 0,
): HistMessage[] {
  // 1) Sliding window — last N turns verbatim.
  let out = messages.slice(-WINDOW_TURNS);

  // 2) Stub tool-result blobs in all but the last STUB_AFTER_TURNS messages.
  const keepVerbatimFrom = Math.max(0, out.length - STUB_AFTER_TURNS);
  out = out.map((m, i) => (i < keepVerbatimFrom && !m.images?.length ? { ...m, content: stubToolBlob(m.content) } : m));

  // 3) Hard cap — trim oldest first until under the per-plan ceiling. Never drop
  //    the most recent user turn.
  const cap = PLAN_TOKEN_CAP[plan] ?? PLAN_TOKEN_CAP.premium;
  const budget = Math.max(1000, cap - systemTokens);
  const tokensOf = (m: HistMessage) => approxTokens(m.content) + (m.images?.length ? 1600 * m.images.length : 0);
  while (out.length > 1 && out.reduce((s, m) => s + tokensOf(m), 0) > budget) {
    out.shift();
  }
  return out;
}
