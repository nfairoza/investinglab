import { serviceClient } from "@/lib/service-client";
import { readServerCache, writeServerCache } from "@/lib/server-cache";
import { buildLedger } from "./ledger/build";
import { generateInsights, dedupe } from "./generators";
import { detectConcentration, detectLookthroughConcentration, type PricedHolding } from "./generators/concentration";
import { detectTargetPace, detectTargetMonthResult, type TargetInput } from "./generators/targets";
import { detectClosures, type PriorOpenInsight } from "./closure";
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

      // MV2: category targets. Targeted categories get target-based pace insights
      // (and a monthly result); we suppress the generic baseline pace_anomaly for
      // those categories so the user sees the target framing, not both.
      const { data: targetRows } = await db.from("category_targets").select("category, monthly_target").eq("user_id", userId);
      const targets: TargetInput[] = (targetRows ?? []).map((r: any) => ({ category: String(r.category), target: Number(r.monthly_target) }));
      if (targets.length) {
        const targetedCats = new Set(targets.map((t) => t.category));
        for (let i = fresh.length - 1; i >= 0; i--) {
          if (fresh[i].kind === "pace_anomaly" && targetedCats.has(fresh[i].subject)) fresh.splice(i, 1);
        }
        fresh.push(...detectTargetPace(ledger, targets, new Date(nowMs)));
        fresh.push(...detectTargetMonthResult(ledger, targets, {}, new Date(nowMs)));
      }

      // F8: concentration insight from holdings (cost-basis value as a call-free
      // weight proxy — the nightly job avoids per-user live quote fan-out).
      const { data: holdRows } = await db.from("holdings").select("symbol, shares, avg_cost").eq("user_id", userId);
      const priced: PricedHolding[] = (holdRows ?? [])
        .map((h: any) => ({ symbol: String(h.symbol).toUpperCase(), value: (Number(h.shares) || 0) * (Number(h.avg_cost) || 0) }))
        .filter((h) => h.value > 0);
      if (priced.length) fresh.push(...detectConcentration(priced));

      // E3: look-through concentration from the nightly-built lookthrough_exposure
      // row (fans ETFs into their holdings). Fires only when true exposure exceeds
      // the direct view, so it doesn't duplicate the direct concentration insight.
      const { data: ltRow } = await db
        .from("lookthrough_exposure")
        .select("by_symbol, by_sector, total_value")
        .eq("user_id", userId)
        .maybeSingle();
      if (ltRow && Number(ltRow.total_value) > 0) {
        fresh.push(...detectLookthroughConcentration(
          (ltRow.by_symbol ?? []) as any,
          (ltRow.by_sector ?? []) as any,
          Number(ltRow.total_value),
        ));
      }

      // Stage-3: turn active recurring charges (F6) into insight rows so they
      // rank alongside everything else on Home + the archive. Price increases
      // are severity 1 too; the notification (F6) is the timely nudge, this is
      // the durable, dismissable insight.
      const { data: recRows } = await db.from("recurring_charges")
        .select("merchant, cadence, avg_amount, last_amount, status").eq("user_id", userId).eq("status", "active");
      for (const r of recRows ?? []) {
        const avg = Number(r.avg_amount) || 0, last = Number(r.last_amount) || 0;
        const increase = last > avg * 1.1;
        if (increase) {
          fresh.push({
            kind: "recurring_increase", subject: String(r.merchant), severity: 1,
            headlineSlots: { merchant: String(r.merchant), prev: +avg.toFixed(2), last: +last.toFixed(2) },
            impactPerYear: r.cadence === "monthly" ? +((last - avg) * 12).toFixed(2) : +(last - avg).toFixed(2),
            evidence: [{ kind: "inputs", inputs: { merchant: String(r.merchant), previous: +avg.toFixed(2), latest: +last.toFixed(2) }, note: `${r.merchant} charge rose from ${avg.toFixed(2)} to ${last.toFixed(2)}.` }],
            factsUsed: ["recurring.v1"], action: { label: "See recurring", deeplink: "/recurring" }, cooldownDays: 30, page: "recurring",
          });
        }
      }

      // Stage-4 closure loop: detect follow-through on prior open spending
      // insights (category spending dropped since we flagged it). Emit a
      // celebratory closure insight + record the captured $/yr in the trust
      // ledger. Mark the source insight done so it stops nagging.
      const { data: openRows } = await db.from("insights")
        .select("id, kind, subject, slots, impact_year")
        .eq("user_id", userId).in("status", ["new", "seen"]).in("kind", ["pace_anomaly", "category_trend"]);
      const priorOpen: PriorOpenInsight[] = (openRows ?? []).map((r: any) => ({
        id: String(r.id), kind: r.kind, subject: r.subject ?? "", slots: (r.slots ?? {}) as Record<string, number | string>, impactPerYear: r.impact_year ?? null,
      }));
      const closures = detectClosures(ledger, priorOpen);
      for (const c of closures) {
        fresh.push(c.closureInsight);
        // Record the outcome (idempotent per source insight) + resolve it.
        try {
          await db.from("insight_outcomes").upsert({
            user_id: userId, insight_id: c.insightId, kind: c.kind, subject: c.subject,
            source: "detected", flagged_year: priorOpen.find((p) => p.id === c.insightId)?.impactPerYear ?? c.capturedYear,
            captured_year: c.capturedYear, note: `${c.subject} down ${Math.round(c.downPct)}% since flagged.`,
          }, { onConflict: "user_id,insight_id" });
        } catch { /* outcome best-effort */ }
        await db.from("insights").update({ status: "done", updated_at: new Date(nowMs).toISOString() }).eq("id", c.insightId);
      }

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
