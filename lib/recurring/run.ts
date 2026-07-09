import { serviceClient } from "@/lib/service-client";
import { createNotification } from "@/lib/notifications";
import { detectRecurring, type RecurringTxn } from "./detect";

// =============================================================================
// F6 nightly recompute. Cross-user, service-role. For each user with
// transactions: detect recurring charges, upsert into recurring_charges
// (preserving a user's 'dismissed' status), and notify on a newly detected
// charge or a price increase. Chunked over users to respect the Hobby cap.
// =============================================================================

export interface RecurringRunResult { users: number; detected: number; notified: number }

async function distinctUserIds(db: ReturnType<typeof serviceClient>): Promise<string[]> {
  if (!db) return [];
  const { data } = await db.from("plaid_transactions").select("user_id").limit(50_000);
  return Array.from(new Set((data ?? []).map((r: any) => String(r.user_id)))).sort();
}

export async function runRecurring(nowMs = Date.now()): Promise<RecurringRunResult> {
  const db = serviceClient();
  if (!db) return { users: 0, detected: 0, notified: 0 };

  const users = await distinctUserIds(db);
  let detected = 0, notified = 0;

  const since = new Date(nowMs - 400 * 86_400_000).toISOString().slice(0, 10); // ~13 months for cadence
  for (const userId of users) {
    try {
      const { data: txnRows } = await db.from("plaid_transactions")
        .select("merchant, name, amount, date, removed").eq("user_id", userId).gte("date", since);
      const txns = (txnRows ?? []) as RecurringTxn[];
      if (!txns.length) continue;

      const charges = detectRecurring(txns);
      detected += charges.length;

      // Existing rows to diff for "new" + preserve dismissed status.
      const { data: existingRows } = await db.from("recurring_charges").select("merchant, status, last_amount").eq("user_id", userId);
      const existing = new Map((existingRows ?? []).map((r: any) => [r.merchant, r]));

      for (const c of charges) {
        const prior = existing.get(c.merchant);
        const status = prior?.status === "dismissed" ? "dismissed" : "active";
        await db.from("recurring_charges").upsert({
          user_id: userId, merchant: c.merchant, cadence: c.cadence, avg_amount: c.avgAmount,
          last_amount: c.lastAmount, last_seen: c.lastSeen, status, updated_at: new Date(nowMs).toISOString(),
        }, { onConflict: "user_id,merchant" });

        if (status === "dismissed") continue;
        // Notify: newly detected, or a price increase not previously seen at this amount.
        const isNew = !prior;
        const isIncrease = c.priceIncrease && (!prior || Number(prior.last_amount) < c.lastAmount);
        if (isNew || isIncrease) {
          const body = isIncrease
            ? `${c.merchant} went from about $${c.avgAmount.toFixed(2)} to $${c.lastAmount.toFixed(2)}.`
            : `New recurring charge detected: ${c.merchant} (~$${c.avgAmount.toFixed(2)}/${c.cadence === "monthly" ? "mo" : "yr"}).`;
          if (await createNotification(db, userId, "recurring", {
            title: isIncrease ? "A subscription went up" : "New recurring charge",
            body,
            deeplink: "/money?tab=recurring",
            dedupeKey: `recurring:${c.merchant}:${isIncrease ? `inc:${c.lastAmount}` : "new"}`,
          })) notified++;
        }
      }
    } catch { /* skip failing user */ }
  }

  return { users: users.length, detected, notified };
}
