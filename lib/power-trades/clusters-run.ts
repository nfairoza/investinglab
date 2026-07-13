import { serviceClient } from "@/lib/service-client";
import { createNotification } from "@/lib/notifications";
import { sendPushToUser } from "@/lib/push/send";
import { detectClusters, type InsiderBuy } from "./clusters";

// PT5 — nightly `insider-cluster` job. Detect 3+ distinct insiders making
// open-market purchases (Form 4 code P → transaction_type "buy") of the same
// issuer within a rolling 30 days, persist to insider_clusters, and notify any
// user who HOLDS or WATCHES the issuer (a followable alert kind wired into the
// F1 notifications inbox + web push). Idempotent: notifications dedupe on
// (issuer, window_end), and cluster rows upsert on issuer.

const LOOKBACK_DAYS = 45; // a touch over the 30d window so edge buys are included

export interface ClusterRunResult { buys: number; clusters: number; notified: number }

export async function runInsiderClusters(nowMs = Date.now()): Promise<ClusterRunResult> {
  const db = serviceClient();
  if (!db) return { buys: 0, clusters: 0, notified: 0 };

  const sinceIso = new Date(nowMs - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const { data: rows } = await db
    .from("power_trade_records")
    .select("id,ticker,person_name,transaction_type,transaction_date,amount_max")
    .eq("source", "sec_form_4")
    .eq("transaction_type", "buy") // code P only — sells/options are other types
    .not("ticker", "is", null)
    .gte("transaction_date", sinceIso)
    .limit(10_000);

  const buys: InsiderBuy[] = (rows ?? [])
    .filter((r: any) => r.ticker && r.person_name && r.transaction_date)
    .map((r: any) => ({
      issuer: String(r.ticker).toUpperCase(),
      insider: String(r.person_name),
      date: String(r.transaction_date).slice(0, 10),
      value: r.amount_max != null ? Number(r.amount_max) : null,
      tradeId: String(r.id),
    }));

  const clusters = detectClusters(buys);

  // Persist (upsert on issuer so re-runs refresh the current cluster).
  for (const c of clusters) {
    await db.from("insider_clusters").upsert({
      issuer: c.issuer,
      window_start: c.windowStart,
      window_end: c.windowEnd,
      insider_count: c.insiderCount,
      insiders: c.insiders,
      total_value: c.totalValue,
      trade_ids: c.tradeIds,
      detected_at: new Date(nowMs).toISOString(),
    }, { onConflict: "issuer" });
  }

  // Notify holders/watchers of each clustered issuer.
  let notified = 0;
  for (const c of clusters) {
    const holders = new Set<string>();
    const { data: hold } = await db.from("holdings").select("user_id").eq("symbol", c.issuer);
    for (const h of hold ?? []) holders.add(String((h as any).user_id));
    const { data: watch } = await db.from("watch_list_items").select("user_id").eq("symbol", c.issuer);
    for (const w of watch ?? []) holders.add(String((w as any).user_id));
    if (holders.size === 0) continue;

    const valLabel = c.totalValue >= 1_000_000 ? `$${(c.totalValue / 1_000_000).toFixed(1)}M` : `$${Math.round(c.totalValue / 1000)}k`;
    const title = "Insider cluster on a stock you follow";
    const body = `${c.insiderCount} insiders bought ${c.issuer} — ${valLabel} combined, last 30d.`;
    const url = `/power-trades?tab=clusters&issuer=${encodeURIComponent(c.issuer)}`;
    const dedupeKey = `insider-cluster:${c.issuer}:${c.windowEnd}`;
    for (const userId of holders) {
      const created = await createNotification(db, userId, "insider_cluster", { title, body, deeplink: url, dedupeKey });
      if (created) {
        notified++;
        // Push is best-effort; a missing subscription is a no-op.
        await sendPushToUser(db, userId, { title, body, url, tag: dedupeKey }).catch(() => 0);
      }
    }
  }

  return { buys: buys.length, clusters: clusters.length, notified };
}
