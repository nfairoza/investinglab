import { serviceClient } from "@/lib/service-client";
import { readServerCache, writeServerCache } from "@/lib/server-cache";
import { buildLedger } from "./ledger/build";
import { generateInsights, dedupe } from "./generators";
import { detectConcentration, detectLookthroughConcentration, type PricedHolding } from "./generators/concentration";
import { detectTargetPace, detectTargetMonthResult, type TargetInput } from "./generators/targets";
import { detectFlowShift } from "./generators/flow-shift";
import { detectGoalDrift, type GoalRow } from "./generators/goals";
import { trailingFundingRate } from "@/lib/money/goals";
import { readCachedRate } from "@/lib/money/rates";
import { detectPowerOverlap } from "./generators/power-overlap";
import type { OverlapHolding, OverlapTrade } from "@/lib/power-trades/overlap";
import { detectClosures, type PriorOpenInsight } from "./closure";
import { loadLedgerInputs, writeLedger, writeInsights, loadPriorInsights } from "./persist";
import { evaluateBudgetThresholds } from "@/lib/money/budget-alerts";

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

export interface UserBuildResult { ledgerBuilt: boolean; insightsCreated: number; monthsOfData: number }

type LiveRate = { ratePct: number; asOf: string | null } | null;

// Build the ledger + run every generator for ONE user, then dedupe + persist.
// This is the exact per-user unit the nightly loop runs — extracted so the
// on-demand historical backfill (Q7) can produce a newly-linked user's first
// insights within minutes instead of waiting for the next nightly cron. `db` is a
// service-role client (backfill) or the nightly service client; queries scope by
// userId either way. `monthsBack` widens the ledger window for the backfill so
// ledger_month is built for every month with data.
export async function buildAndPersistForUser(
  db: ReturnType<typeof serviceClient>,
  userId: string,
  nowMs: number,
  liveRate: LiveRate,
  monthsBack = 13,
): Promise<UserBuildResult> {
  if (!db) return { ledgerBuilt: false, insightsCreated: 0, monthsOfData: 0 };
  const inputs = await loadLedgerInputs(db, userId, monthsBack);
  if (!inputs.txns.length) return { ledgerBuilt: false, insightsCreated: 0, monthsOfData: 0 };
  const ledger = buildLedger(inputs, nowMs);
  await writeLedger(db, userId, ledger);

  const fresh = generateInsights(ledger, liveRate);
  fresh.push(...detectFlowShift(ledger, new Date(nowMs)));

  // H1: budgets (formerly MV2 category_targets — same generators, new table).
  const { data: budgetRows } = await db.from("budgets")
    .select("category, monthly_amount").eq("owner_id", userId).eq("scope", "personal").eq("status", "active");
  const targets: TargetInput[] = (budgetRows ?? []).map((r: any) => ({ category: String(r.category), target: Number(r.monthly_amount) }));
  if (targets.length) {
    const targetedCats = new Set(targets.map((t) => t.category));
    for (let i = fresh.length - 1; i >= 0; i--) {
      if (fresh[i].kind === "pace_anomaly" && targetedCats.has(fresh[i].subject)) fresh.splice(i, 1);
    }
    fresh.push(...detectTargetPace(ledger, targets, new Date(nowMs)));
    fresh.push(...detectTargetMonthResult(ledger, targets, {}, new Date(nowMs)));
  }
  // H1: budget threshold alerts (80%/100%) — deduped per threshold/month/budget.
  await evaluateBudgetThresholds(db, userId, ledger, nowMs).catch(() => {});

  const { data: goalRows } = await db.from("goals").select("id, name, target_amount, target_date, linked_kind, account_id").eq("user_id", userId).eq("status", "active");
  if (goalRows && goalRows.length) {
    const funding = trailingFundingRate(ledger.months.map((m) => m.savingsFlow), 3);
    const savingsBalance = ledger.balances.filter((b) => b.isLiquid).reduce((s, b) => s + (b.current || 0), 0);
    const goals: GoalRow[] = goalRows.map((g: any) => {
      const investmentLinked = g.linked_kind === "account";
      const currentAmount = investmentLinked && g.account_id
        ? (ledger.balances.find((b) => b.accountId === g.account_id)?.current ?? 0)
        : Math.min(savingsBalance, Number(g.target_amount));
      return { id: String(g.id), name: String(g.name), targetAmount: Number(g.target_amount), targetDate: g.target_date ?? null, currentAmount };
    });
    fresh.push(...detectGoalDrift(goals, funding, new Date(nowMs).toISOString().slice(0, 10)));
  }

  const { data: followRows } = await db.from("follows").select("person_name").eq("user_id", userId);
  const followedNames = (followRows ?? []).map((r: any) => String(r.person_name)).filter(Boolean);
  if (followedNames.length) {
    const { data: ovHoldRows } = await db.from("holdings").select("symbol, shares, avg_cost").eq("user_id", userId);
    const holdings: OverlapHolding[] = (ovHoldRows ?? [])
      .map((h: any) => ({ symbol: String(h.symbol).toUpperCase(), value: (Number(h.shares) || 0) * (Number(h.avg_cost) || 0) }))
      .filter((h: OverlapHolding) => h.value > 0);
    if (holdings.length) {
      const since = new Date(nowMs - 60 * 86_400_000).toISOString().slice(0, 10);
      const { data: ptRows } = await db.from("power_trade_records")
        .select("person_name, ticker, transaction_type, amount_label, disclosure_date")
        .in("transaction_type", ["buy", "sell"]).not("ticker", "is", null).gte("disclosure_date", since).limit(5_000);
      const recentTrades: OverlapTrade[] = (ptRows ?? []).map((t: any) => ({
        personName: String(t.person_name), ticker: String(t.ticker), type: t.transaction_type,
        amountLabel: t.amount_label ?? null, disclosureDate: t.disclosure_date ?? null,
      }));
      fresh.push(...detectPowerOverlap(followedNames, holdings, recentTrades));
    }
  }

  const { data: holdRows } = await db.from("holdings").select("symbol, shares, avg_cost").eq("user_id", userId);
  const priced: PricedHolding[] = (holdRows ?? [])
    .map((h: any) => ({ symbol: String(h.symbol).toUpperCase(), value: (Number(h.shares) || 0) * (Number(h.avg_cost) || 0) }))
    .filter((h) => h.value > 0);
  if (priced.length) fresh.push(...detectConcentration(priced));

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

  const { data: openRows } = await db.from("insights")
    .select("id, kind, subject, slots, impact_year")
    .eq("user_id", userId).in("status", ["new", "seen"]).in("kind", ["pace_anomaly", "category_trend"]);
  const priorOpen: PriorOpenInsight[] = (openRows ?? []).map((r: any) => ({
    id: String(r.id), kind: r.kind, subject: r.subject ?? "", slots: (r.slots ?? {}) as Record<string, number | string>, impactPerYear: r.impact_year ?? null,
  }));
  const closures = detectClosures(ledger, priorOpen);
  for (const c of closures) {
    fresh.push(c.closureInsight);
    try {
      await db.from("insight_outcomes").upsert({
        user_id: userId, insight_id: c.insightId, kind: c.kind, subject: c.subject,
        source: "detected", flagged_year: priorOpen.find((p) => p.id === c.insightId)?.impactPerYear ?? c.capturedYear,
        captured_year: c.capturedYear, note: `${c.subject} down ${Math.round(c.downPct)}% since flagged.`,
      }, { onConflict: "user_id,insight_id" });
    } catch { /* outcome best-effort */ }
    await db.from("insights").update({ status: "done", updated_at: new Date(nowMs).toISOString() }).eq("id", c.insightId);
  }

  let insightsCreated = 0;
  if (fresh.length) {
    const prior = await loadPriorInsights(db, userId);
    const keep = dedupe(fresh, prior, nowMs);
    insightsCreated = await writeInsights(db, userId, keep);
  }
  return { ledgerBuilt: true, insightsCreated, monthsOfData: ledger.monthsOfData };
}

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

  // MV4: the cached live cash rate (global, read once for the whole tick). Null
  // when unavailable → generators degrade to the previous generic phrasing.
  const cachedRate = await readCachedRate();
  const liveRate = cachedRate ? { ratePct: cachedRate.ratePct, asOf: cachedRate.asOf } : null;

  let ledgersBuilt = 0, insightsCreated = 0;
  for (const userId of slice) {
    try {
      const r = await buildAndPersistForUser(db, userId, nowMs, liveRate);
      if (r.ledgerBuilt) ledgersBuilt++;
      insightsCreated += r.insightsCreated;
    } catch { /* skip a failing user; the next tick retries */ }
  }

  await writeServerCache(CURSOR_KEY, { i: wrapped ? 0 : start + sliceSize }).catch(() => {});
  return { users: slice.length, ledgersBuilt, insightsCreated, wrapped };
}
