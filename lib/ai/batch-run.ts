import { pendingBatch, collectBatch, clearBatch } from "./batch";
import { writeServerCache } from "@/lib/server-cache";

// AIOPT A5 — batch-collect cron. For each namespace with an in-flight batch,
// poll it; when ended, write the results to that namespace's results cache and
// clear the pending marker. Idempotent: a batch still processing is left for the
// next tick; a collected batch's marker is cleared so it isn't re-polled.
//
// Namespaces are registered here as batch consumers ship. The mechanism is in
// place; wiring a heavy generator (e.g. digest narration blocks) to submitBatch
// is the remaining step per feature. Today the loop is a no-op until a consumer
// records a pending batch — safe to run.

const NAMESPACES = ["insights-narration", "digest-narration"];

export interface BatchCollectResult { checked: number; collected: number; pending: number }

export async function runBatchCollect(): Promise<BatchCollectResult> {
  let checked = 0, collected = 0, pending = 0;
  for (const ns of NAMESPACES) {
    const state = await pendingBatch(ns);
    if (!state?.batchId) continue;
    checked++;
    try {
      const { ready, results } = await collectBatch(state.batchId);
      if (!ready) { pending++; continue; }
      // Persist results for the consumer to read; clear the in-flight marker.
      await writeServerCache(`ai:batch-results:${ns}`, { results, collectedAt: new Date().toISOString() }).catch(() => {});
      await clearBatch(ns);
      collected++;
    } catch {
      // A failed poll (expired/errored batch) — clear the marker so the consumer's
      // next scheduled run regenerates real-time. No user-visible gap.
      await clearBatch(ns);
    }
  }
  return { checked, collected, pending };
}
