import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlaid, plaidConfigured } from "@/lib/plaid";
import { marketData } from "@/lib/providers";

// =============================================================================
// Net-worth compute service. ALL math is done here in code — the AI never
// computes totals, it only narrates the computed numbers.
//
// Sign convention (normalized everywhere):
//   • assets are positive
//   • liabilities are stored/returned as positive balances OWED
//   • net worth = total_assets - total_liabilities
// Liabilities are never shown negative; they're only subtracted in net math.
// =============================================================================

export type AssetType = "cash" | "investment" | "retirement" | "real_estate" | "vehicle" | "other_asset";
export type LiabilityType = "credit_card" | "mortgage" | "loan" | "other_liability";
export type ItemType = AssetType | LiabilityType;

const LIABILITY_TYPES: ItemType[] = ["credit_card", "mortgage", "loan", "other_liability"];
// Liquid = cash + taxable brokerage; everything else is illiquid.
const LIQUID_TYPES: ItemType[] = ["cash", "investment"];

export interface NWItem {
  source: "plaid" | "manual" | "holdings";
  label: string;
  type: ItemType;
  kind: "asset" | "liability";
  amount: number;        // positive magnitude
  liquid: boolean;
}

export interface NetWorthResult {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  liquid: number;
  illiquid: number;
  byType: Record<string, number>;   // signed contribution per type (assets +, liabilities -) for breakdown
  items: NWItem[];
  excluded: string[];                // accounts skipped (unavailable/stale)
  sourceHash: string;                // changes when balances change → snapshot write discipline
}

// Map Plaid account.type/subtype to our type taxonomy.
function classifyPlaidAccount(a: any): { type: ItemType; kind: "asset" | "liability" } {
  const t = a.type as string;
  const sub = (a.subtype as string) ?? "";
  if (t === "credit") return { type: "credit_card", kind: "liability" };
  if (t === "loan") {
    if (sub === "mortgage") return { type: "mortgage", kind: "liability" };
    return { type: "loan", kind: "liability" };
  }
  if (t === "depository") return { type: "cash", kind: "asset" };
  if (t === "investment" || t === "brokerage") {
    // Retirement-style subtypes are illiquid.
    if (/401k|403b|ira|retirement|pension|roth|457|tsp/i.test(sub)) return { type: "retirement", kind: "asset" };
    return { type: "investment", kind: "asset" };
  }
  return { type: "other_asset", kind: "asset" };
}

function liquidityOf(type: ItemType): boolean {
  return LIQUID_TYPES.includes(type);
}

export async function computeNetWorth(ctx: { supabase: SupabaseClient; userId: string }): Promise<NetWorthResult> {
  const items: NWItem[] = [];
  const excluded: string[] = [];
  // account_id → true once counted as a liability via Plaid Liabilities, so the
  // plain accounts pass doesn't double-count the same card/loan.
  const liabilityAccountIds = new Set<string>();

  if (plaidConfigured()) {
    const { data: plaidItems } = await ctx.supabase.from("plaid_items").select("institution_name, access_token");
    const plaid = getPlaid();

    // ── Pass 1: Liabilities (authoritative balance/APR for cards/loans/mortgages) ──
    for (const it of plaidItems ?? []) {
      try {
        const resp = await plaid.liabilitiesGet({ access_token: it.access_token });
        const accts = new Map((resp.data.accounts ?? []).map((a: any) => [a.account_id, a]));
        const L = resp.data.liabilities ?? {};
        const pushLiab = (accountId: string | null | undefined, type: LiabilityType, fallbackName: string) => {
          const a: any = accountId ? accts.get(accountId) : null;
          const bal = a?.balances?.current;
          if (bal == null) return;
          liabilityAccountIds.add(accountId ?? "");
          items.push({ source: "plaid", label: `${it.institution_name ?? "Institution"} · ${a?.name ?? fallbackName}`, type, kind: "liability", amount: Math.abs(Number(bal)), liquid: false });
        };
        for (const c of L.credit ?? []) pushLiab(c.account_id, "credit_card", "Credit card");
        for (const m of L.mortgage ?? []) pushLiab(m.account_id, "mortgage", "Mortgage");
        for (const s of L.student ?? []) pushLiab(s.account_id, "loan", "Student loan");
      } catch { /* item may not support liabilities */ }
    }

    // ── Pass 2: Balances for assets + any liability not already captured ──
    for (const it of plaidItems ?? []) {
      try {
        const resp = await plaid.accountsBalanceGet({ access_token: it.access_token });
        for (const a of resp.data.accounts ?? []) {
          const { type, kind } = classifyPlaidAccount(a);
          const cur = a.balances?.current;
          const label = `${it.institution_name ?? "Institution"} · ${a.name}`;
          if (cur == null) { excluded.push(label); continue; }
          if (kind === "liability") {
            if (liabilityAccountIds.has(a.account_id)) continue; // already counted via Liabilities
            items.push({ source: "plaid", label, type, kind, amount: Math.abs(Number(cur)), liquid: false });
          } else {
            // Investment balances: use holdings value when available is more accurate,
            // but accountsBalanceGet current is fine as the account-level total.
            items.push({ source: "plaid", label, type, kind, amount: Number(cur), liquid: liquidityOf(type) });
          }
        }
      } catch { /* skip institution on error */ }
    }
  }

  // ── Manual + E*TRADE stock holdings (live-priced) → taxable investment asset ──
  const { data: hRows } = await ctx.supabase.from("holdings").select("symbol, shares, market_value");
  if (hRows?.length) {
    const symbols = Array.from(new Set(hRows.map((h: any) => String(h.symbol).toUpperCase())));
    const px: Record<string, number> = {};
    await Promise.all(symbols.map(async (s) => { try { const q = await marketData.getQuote(s); if (q.data?.price) px[s] = q.data.price; } catch { /* ignore */ } }));
    let val = 0;
    for (const h of hRows) {
      const sym = String(h.symbol).toUpperCase();
      val += px[sym] != null ? px[sym] * Number(h.shares) : (h.market_value != null ? Number(h.market_value) : 0);
    }
    if (val > 0) items.push({ source: "holdings", label: "Stock holdings (manual / E*TRADE)", type: "investment", kind: "asset", amount: val, liquid: true });
  }

  // ── Manual cash row (skip if Plaid already provides depository balances) ──
  const { data: cashRow } = await ctx.supabase.from("cash").select("amount, source").maybeSingle();
  if (cashRow && cashRow.source !== "plaid" && Number(cashRow.amount) > 0) {
    items.push({ source: "manual", label: "Cash (manual)", type: "cash", kind: "asset", amount: Number(cashRow.amount), liquid: true });
  }

  // ── Manual items (house, car, private loans, etc.) ──
  const { data: manual } = await ctx.supabase.from("manual_items").select("name, kind, type, value");
  for (const m of manual ?? []) {
    const type = m.type as ItemType;
    const kind = (m.kind === "liability" ? "liability" : "asset") as "asset" | "liability";
    items.push({ source: "manual", label: m.name, type, kind, amount: Math.abs(Number(m.value)), liquid: kind === "asset" && liquidityOf(type) });
  }

  // ── Totals (sign-normalized) ──
  let totalAssets = 0, totalLiabilities = 0, liquid = 0, illiquid = 0;
  const byType: Record<string, number> = {};
  for (const it of items) {
    if (it.kind === "asset") {
      totalAssets += it.amount;
      if (it.liquid) liquid += it.amount; else illiquid += it.amount;
      byType[it.type] = (byType[it.type] ?? 0) + it.amount;
    } else {
      totalLiabilities += it.amount;
      byType[it.type] = (byType[it.type] ?? 0) - it.amount;
    }
  }
  const netWorth = totalAssets - totalLiabilities;

  // Source hash: lets the snapshot writer skip writes when nothing changed.
  const sourceHash = items
    .map((i) => `${i.source}:${i.type}:${i.kind}:${Math.round(i.amount)}`)
    .sort()
    .join("|");

  return {
    totalAssets: +totalAssets.toFixed(2),
    totalLiabilities: +totalLiabilities.toFixed(2),
    netWorth: +netWorth.toFixed(2),
    liquid: +liquid.toFixed(2),
    illiquid: +illiquid.toFixed(2),
    byType,
    items,
    excluded,
    sourceHash,
  };
}

// First day of the current month as YYYY-MM-DD (computed at request time).
export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export { LIABILITY_TYPES };
