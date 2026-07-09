import type { SupabaseClient } from "@supabase/supabase-js";

// =============================================================================
// F2 — Weekly digest assembler. Builds a per-user digest from EXISTING tables
// only (no new provider calls): net-worth delta, top holding movers, followed-
// people filings this week, and one Rukmani insight (F8/Insights Engine). Pure
// data assembly — rendering (HTML/text) is separate so it's testable.
// =============================================================================

export interface DigestMover { symbol: string; changePct: number; reason: string }
export interface DigestFiling { personName: string; summary: string }
export interface DigestData {
  netWorth: number | null;
  netWorthDeltaWeek: number | null;
  movers: DigestMover[];
  filings: DigestFiling[];
  insight: string | null;
  generatedAt: string;
}

// Assemble the digest for one user. `db` scoped by userId (works for both
// service-role and user clients).
export async function assembleDigest(db: SupabaseClient, userId: string, nowMs = Date.now()): Promise<DigestData> {
  const weekAgo = new Date(nowMs - 7 * 86_400_000).toISOString().slice(0, 10);

  // Net-worth delta from monthly snapshots (latest two points bracketing ~a week
  // is coarse; we use the two most recent snapshots as the trend signal).
  const { data: nwRows } = await db.from("net_worth_snapshots")
    .select("month, net_worth").eq("user_id", userId).order("month", { ascending: false }).limit(2);
  const netWorth = nwRows?.[0]?.net_worth ?? null;
  const netWorthDeltaWeek = nwRows && nwRows.length >= 2 ? Number(nwRows[0].net_worth) - Number(nwRows[1].net_worth) : null;

  // Top movers: read cached quotes for held symbols if present (server_cache);
  // fall back to empty (never a fresh provider call in the digest path).
  const movers: DigestMover[] = [];
  try {
    const { data: cache } = await db.from("server_cache").select("value").eq("key", `digest:movers:${userId}`).maybeSingle();
    const cached = (cache?.value as { movers?: DigestMover[] } | null)?.movers;
    if (Array.isArray(cached)) movers.push(...cached.slice(0, 3));
  } catch { /* movers optional */ }

  // Followed-people filings this week (F1).
  const filings: DigestFiling[] = [];
  const { data: follows } = await db.from("follows").select("person_id, person_name").eq("user_id", userId);
  const personIds = (follows ?? []).map((f: any) => String(f.person_id));
  if (personIds.length) {
    const { data: recs } = await db.from("power_trade_records")
      .select("person_name, ticker, transaction_type, amount_label, disclosure_date")
      .gte("disclosure_date", weekAgo).in("person_id", personIds).limit(10);
    for (const r of recs ?? []) {
      filings.push({ personName: r.person_name, summary: `${r.transaction_type ?? "trade"}${r.ticker ? ` ${r.ticker}` : ""}${r.amount_label ? ` (${r.amount_label})` : ""}` });
    }
  }

  // One Rukmani insight (Insights Engine). Top active, if any.
  let insight: string | null = null;
  try {
    const { data: ins } = await db.from("insights")
      .select("slots, kind").eq("user_id", userId).in("status", ["new", "seen"])
      .order("severity", { ascending: false }).order("impact_year", { ascending: false }).limit(1);
    if (ins?.[0]) insight = summarizeInsight(ins[0].kind, ins[0].slots as Record<string, unknown>);
  } catch { /* insights optional (engine may not have run) */ }

  return { netWorth, netWorthDeltaWeek, movers, filings, insight, generatedAt: new Date(nowMs).toISOString() };
}

// Turn an insight's slots into a single number-free-safe sentence (numbers come
// from slots). Kept simple; the digest is a summary, not the full insight card.
function summarizeInsight(kind: string, slots: Record<string, unknown>): string {
  const n = (k: string) => (typeof slots[k] === "number" ? (slots[k] as number).toLocaleString("en-US", { maximumFractionDigits: 0 }) : String(slots[k] ?? ""));
  switch (kind) {
    case "pace_anomaly": return `Spending on ${slots.category} is running high this month — worth a look.`;
    case "debt_vs_cash": return `Idle cash could knock about $${n("guaranteedAnnual")}/yr off your ${slots.card} balance.`;
    case "interest_bleed": return `Your cards are on pace to cost about $${n("projectedAnnual")} in interest this year.`;
    case "positive_spend_down": return `Nice — you've spent less on ${slots.category} than usual lately.`;
    case "positive_networth": return `Your net worth has been climbing. Steady progress.`;
    default: return "There's something worth a look in your accounts.";
  }
}

export function hasContent(d: DigestData): boolean {
  return d.netWorthDeltaWeek != null || d.movers.length > 0 || d.filings.length > 0 || d.insight != null;
}
