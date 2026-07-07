import { NextResponse } from "next/server";
import { getPlaid, plaidConfigured, selectPlaidItems, resolvePlaidToken } from "@/lib/plaid";
import { getUserClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// GET /api/plaid/liabilities — credit cards, loans, and mortgages for the
// current user's linked accounts: APR, balance, next payment. Read-only.
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!plaidConfigured()) return NextResponse.json({ liabilities: [], configured: false });

  const { rows: items, error: itemsErr } = await selectPlaidItems(ctx.supabase, "item_id, institution_name");
  if (itemsErr) return NextResponse.json({ error: "db_error", message: itemsErr.message }, { status: 500 });
  if (!items || items.length === 0) return NextResponse.json({ liabilities: [] });

  const plaid = getPlaid();
  const liabilities: Record<string, unknown>[] = [];

  // Fetch every linked institution's liabilities in parallel (was sequential).
  const results = await Promise.allSettled(
    items.map((it) => {
      const token = resolvePlaidToken(it as any);
      if (!token) return Promise.reject(new Error("no token"));
      return plaid.liabilitiesGet({ access_token: token });
    }),
  );

  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx];
    const r = results[idx];
    if (r.status !== "fulfilled") continue; // item may not support liabilities
    {
      const resp = r.value;
      const acctName = new Map((resp.data.accounts ?? []).map((a) => [a.account_id, a]));
      const L = resp.data.liabilities ?? {};

      for (const c of L.credit ?? []) {
        const a = c.account_id ? acctName.get(c.account_id) : undefined;
        liabilities.push({
          kind: "credit", institution: it.institution_name,
          name: a?.name ?? "Credit card", mask: a?.mask ?? null,
          balance: a?.balances?.current ?? null,
          limit: a?.balances?.limit ?? null,
          apr: c.aprs?.[0]?.apr_percentage ?? null,
          nextPaymentDue: c.next_payment_due_date ?? null,
          minPayment: c.minimum_payment_amount ?? null,
          currency: a?.balances?.iso_currency_code ?? "USD",
        });
      }
      for (const m of L.mortgage ?? []) {
        const a = m.account_id ? acctName.get(m.account_id) : undefined;
        liabilities.push({
          kind: "mortgage", institution: it.institution_name,
          name: a?.name ?? "Mortgage", mask: a?.mask ?? null,
          balance: a?.balances?.current ?? null,
          apr: m.interest_rate?.percentage ?? null,
          nextPaymentDue: m.next_payment_due_date ?? null,
          minPayment: m.next_monthly_payment ?? null,
          currency: a?.balances?.iso_currency_code ?? "USD",
        });
      }
      for (const s of L.student ?? []) {
        const a = s.account_id ? acctName.get(s.account_id) : undefined;
        liabilities.push({
          kind: "student", institution: it.institution_name,
          name: a?.name ?? "Student loan", mask: a?.mask ?? null,
          balance: a?.balances?.current ?? null,
          apr: s.interest_rate_percentage ?? null,
          nextPaymentDue: s.next_payment_due_date ?? null,
          minPayment: s.minimum_payment_amount ?? null,
          currency: a?.balances?.iso_currency_code ?? "USD",
        });
      }
    }
  }

  return NextResponse.json({ liabilities });
}
