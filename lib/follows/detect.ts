import { serviceClient } from "@/lib/service-client";
import { createNotification } from "@/lib/notifications";

// =============================================================================
// F1 detection — after Power Trades data refreshes, diff recent filings against
// every user's follows and create a notification per new hit. Cross-user,
// service-role. Dedupe on (person_id, filing_id) via the notification payload's
// dedupeKey, so re-running the cron never double-notifies.
//
// "Rep. X reported buying $50–100k NVDA (filed today)."
// =============================================================================

function amountLabel(min: number | null, max: number | null, label: string | null): string {
  if (label) return label;
  if (min != null && max != null) return `$${Math.round(min / 1000)}–${Math.round(max / 1000)}k`;
  if (min != null) return `$${Math.round(min / 1000)}k+`;
  return "";
}

function verb(t: string | null): string {
  switch ((t ?? "").toLowerCase()) {
    case "buy": return "reported buying";
    case "sell": return "reported selling";
    case "option": return "reported an option on";
    case "gift": return "reported a gift of";
    default: return "reported a trade in";
  }
}

export interface FollowDetectResult { follows: number; filings: number; notified: number }

// Look back `sinceDays` for filings whose person is followed by someone.
export async function detectFollowFilings(sinceDays = 3, nowMs = Date.now()): Promise<FollowDetectResult> {
  const db = serviceClient();
  if (!db) return { follows: 0, filings: 0, notified: 0 };

  // All follows across users, grouped by the followed person's NAME (lowercased).
  // We key on name, not person_id: seed/"known" people in the directory carry a
  // synthetic id ("known:<slug>") that never matches a power_trade_records uuid,
  // and matching a "known:" string against a uuid column would error. Names are
  // reliably present on both follows and filings.
  const { data: followRows } = await db.from("follows").select("user_id, person_id, person_name");
  const follows = followRows ?? [];
  if (!follows.length) return { follows: 0, filings: 0, notified: 0 };

  const nameKey = (s: string) => s.trim().toLowerCase();
  const followersByName = new Map<string, string[]>();
  for (const f of follows) {
    const key = nameKey(String(f.person_name));
    if (!key) continue;
    const arr = followersByName.get(key) ?? [];
    arr.push(String(f.user_id));
    followersByName.set(key, arr);
  }

  // Recent filings; match by person_name against the followed set.
  const sinceIso = new Date(nowMs - sinceDays * 86_400_000).toISOString().slice(0, 10);
  const names = [...followersByName.keys()];
  if (!names.length) return { follows: follows.length, filings: 0, notified: 0 };
  const { data: filings } = await db.from("power_trade_records")
    .select("id, person_id, person_name, ticker, transaction_type, amount_min, amount_max, amount_label, disclosure_date")
    .gte("disclosure_date", sinceIso);

  let notified = 0;
  for (const f of filings ?? []) {
    const followers = followersByName.get(nameKey(String(f.person_name)));
    if (!followers) continue;
    const amt = amountLabel(f.amount_min, f.amount_max, f.amount_label);
    const ticker = f.ticker ? ` ${f.ticker}` : "";
    const body = `${f.person_name} ${verb(f.transaction_type)}${amt ? ` ${amt}` : ""}${ticker} (filed ${f.disclosure_date}).`;
    const payload = {
      title: "New filing from someone you follow",
      body,
      deeplink: `/power-trades?person=${encodeURIComponent(f.person_name)}`,
      dedupeKey: `${f.person_id}:${f.id}`,
      personId: String(f.person_id),
      filingId: String(f.id),
    };
    for (const userId of followers) {
      if (await createNotification(db, userId, "follow_filing", payload)) notified++;
    }
  }

  return { follows: follows.length, filings: filings?.length ?? 0, notified };
}
