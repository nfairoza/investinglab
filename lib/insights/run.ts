import { serviceClient } from "@/lib/service-client";
import { readServerCache, writeServerCache } from "@/lib/server-cache";
import { buildLedger } from "./ledger/build";
import { generateInsights, dedupe } from "./generators";
import { loadLedgerInputs, writeLedger, writeInsights, loadPriorInsights } from "./persist";

// =============================================================================
// Insights nightly build — cross-user, service-role (bypasses RLS). For each
// user with transactions: load inputs → buildLedger → run facts+generators →
// dedupe against recent insights → persist ledger + new insights. Narration is
// NOT generated here (it's lazy on GET, cached) so the job stays cheap and fast.
//
// Chunked like buildMapChunk: a cursor over the distinct user list advances each
// tick so a big user base still fits under Vercel Hobby's 10s function cap. The
// nightly cadence means the whole base is covered well within a day.
// =============================================================================

const CURSOR_KEY = "insights:cursor";

async function distinctUserIds(db: ReturnType<typeof serviceClient>): Promise<string[]> {
  if (!db) return [];
  // Distinct users who have any stored transactions. PostgREST has no DISTINCT,
  // so we page the id column and dedupe in memory (user counts are modest here).
  const { data } = await db.from("plaid_transactions").select("user_id").limit(50_000);
  return Array.from(new Set((data ?? []).map((r: any) => String(r.user_id)))).sort();
}

export interface InsightsRunResult { users: number; ledgersBuilt: number; insightsCreated: number; wrapped: boolean }

export async function runInsightsBuild(opts: { sliceSize?: number; nowMs?: number } = {}): Promise<InsightsRunResult> {
  const db = serviceClient();
  if (!db) return { users: 0, ledgersBuilt: 0, insightsCreated: 0, wrapped: false };
  const sliceSize = opts.sliceSize ?? 40;
  const nowMs = opts.nowMs ?? Date.now();

  const users = await distinctUserIds(db);
  if (!users.length) return { users: 0, ledgersBuilt: 0, insightsCreated: 0, wrapped: false };

  // Resume from cursor.
  const { value: cur } = await readServerCache<{ i: number }>(CURSOR_KEY, Number.MAX_SAFE_INTEGER).catch(() => ({ value: null } as any));
  const start = (cur?.i ?? 0) % users.length;
  const slice = users.slice(start, start + sliceSize);
  const wrapped = start + sliceSize >= users.length;

  let ledgersBuilt = 0, insightsCreated = 0;
  for (const userId of slice) {
    try {
      const inputs = await loadLedgerInputs(db, userId);
      if (!inputs.txns.length) continue;
      const ledger = buildLedger(inputs, nowMs);
      await writeLedger(db, userId, ledger);
      ledgersBuilt++;

      const fresh = generateInsights(ledger);
      if (fresh.length) {
        const prior = await loadPriorInsights(db, userId);
        const keep = dedupe(fresh, prior, nowMs);
        insightsCreated += await writeInsights(db, userId, keep);
      }
    } catch { /* skip a failing user; the next tick retries */ }
  }

  await writeServerCache(CURSOR_KEY, { i: wrapped ? 0 : start + sliceSize }).catch(() => {});
  return { users: slice.length, ledgersBuilt, insightsCreated, wrapped };
}
