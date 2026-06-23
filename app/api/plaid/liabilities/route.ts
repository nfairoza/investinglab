import { NextResponse } from "next/server";
import { getPlaid, plaidConfigured } from "@/lib/plaid";
import { getUserClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// GET /api/plaid/liabilities — credit cards, loans, and mortgages for the
// current user's linked accounts: APR, balance, next payment. Read-only.
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!plaidConfigured()) return NextResponse.json({ liabilities: [], configured: false });

  const { data: items } = await ctx.supabase
    .from("plaid_items")
    .select("item_id, institution_name, access_token");
  if (!items || items.length === 0) return NextResponse.json({ liabilities: [] });

  const plaid = getPlaid();
  const liabilities: any[] = [];

  for (const it of items) {
    try {
      const resp = await plaid.liabilitiesGet({ access_token: it.access_token });
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
    } catch { /* item may not support liabilities */ }
  }

  return NextResponse.json({ liabilities });
}
