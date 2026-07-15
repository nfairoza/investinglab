import { resolveApiKey } from "./anthropic";
import { readServerCache, writeServerCache } from "@/lib/server-cache";

// =============================================================================
// AIOPT A5 — Anthropic Message Batches. Latency-insensitive generation (nightly
// narration pre-warm, digest blocks, rebuilds) can run through the Batch API at
// ~50% of the token cost. This module is the mechanism: submit a batch, then a
// follow-up cron tick collects results. Idempotent; results keyed by custom_id.
//
// Interactive paths (chat, a memo a user is waiting for) must NEVER batch — this
// is only for work no human is watching. Callers opt in explicitly.
//
// State (the in-flight batch id + pending custom_ids) lives in server_cache so a
// submit tick and a later collect tick coordinate across serverless invocations.
// If a batch fails or expires, the caller's next scheduled run regenerates
// real-time as before — no user-visible gap.
// =============================================================================

const API = "https://api.anthropic.com/v1/messages/batches";
const HEADERS = () => ({
  "content-type": "application/json",
  "x-api-key": resolveApiKey() ?? "",
  "anthropic-version": "2023-06-01",
});

export interface BatchRequest {
  customId: string;        // stable id you use to match the result back
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
}

export interface BatchHandle {
  batchId: string;
  submittedAt: string;
  count: number;
}

// Submit a batch. Returns a handle whose id a later collect() call polls. Throws
// on a non-OK response so the caller can fall back to real-time generation.
export async function submitBatch(requests: BatchRequest[]): Promise<BatchHandle> {
  if (!resolveApiKey()) throw new Error("no Claude key for batch");
  if (!requests.length) throw new Error("empty batch");
  const body = {
    requests: requests.map((r) => ({
      custom_id: r.customId,
      params: {
        model: r.model,
        max_tokens: r.maxTokens ?? 512,
        system: r.system,
        messages: [{ role: "user", content: r.user }],
      },
    })),
  };
  const res = await fetch(API, { method: "POST", headers: HEADERS(), body: JSON.stringify(body), cache: "no-store" });
  if (!res.ok) throw new Error(`batch submit HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}`);
  const json = (await res.json()) as { id: string };
  return { batchId: json.id, submittedAt: new Date().toISOString(), count: requests.length };
}

export interface BatchResult { customId: string; text: string; ok: boolean }

// Poll a batch; when `ended`, fetch + parse its results. Returns { ready:false }
// while still processing so the collect cron can try again next tick.
export async function collectBatch(batchId: string): Promise<{ ready: boolean; results: BatchResult[] }> {
  const res = await fetch(`${API}/${batchId}`, { headers: HEADERS(), cache: "no-store" });
  if (!res.ok) throw new Error(`batch status HTTP ${res.status}`);
  const status = (await res.json()) as { processing_status: string; results_url?: string | null };
  if (status.processing_status !== "ended" || !status.results_url) return { ready: false, results: [] };

  const rres = await fetch(status.results_url, { headers: HEADERS(), cache: "no-store" });
  if (!rres.ok) throw new Error(`batch results HTTP ${rres.status}`);
  const text = await rres.text();
  const results: BatchResult[] = [];
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    try {
      const row = JSON.parse(s) as { custom_id: string; result?: { type: string; message?: { content?: Array<{ type: string; text?: string }> } } };
      const ok = row.result?.type === "succeeded";
      const out = (row.result?.message?.content ?? []).filter((b) => b.type === "text" && b.text).map((b) => b.text as string).join("\n");
      results.push({ customId: row.custom_id, text: out, ok });
    } catch { /* skip a malformed result line */ }
  }
  return { ready: true, results };
}

// Coordination state (one in-flight batch per namespace) in server_cache.
const stateKey = (ns: string) => `ai:batch:${ns}`;
export interface BatchState { batchId: string; submittedAt: string; count: number }

export async function rememberBatch(ns: string, handle: BatchHandle): Promise<void> {
  await writeServerCache(stateKey(ns), { batchId: handle.batchId, submittedAt: handle.submittedAt, count: handle.count } as BatchState).catch(() => {});
}
export async function pendingBatch(ns: string): Promise<BatchState | null> {
  return (await readServerCache<BatchState>(stateKey(ns), Number.MAX_SAFE_INTEGER).catch(() => ({ value: null } as any))).value ?? null;
}
export async function clearBatch(ns: string): Promise<void> {
  await writeServerCache(stateKey(ns), null as any).catch(() => {});
}
