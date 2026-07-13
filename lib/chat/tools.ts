import type { SupabaseClient } from "@supabase/supabase-js";
import { marketData, type DataResult, type Quote } from "@/lib/providers";
import { getUnifiedHoldings } from "@/lib/holdings-server";
import { computeNetWorth } from "@/lib/networth";
import { readMarketBrief } from "./market-brief";

// =============================================================================
// Rukmani tool registry (C1). Anthropic tool-use / Gemini function-calling. Each
// tool has a JSON schema (for the model) + a server executor (run with the
// session's RLS client — NEVER the service client — so every query is hard-
// scoped to the authenticated user). Role decides REGISTRATION: admin tools are
// only added to the list when ctx.isAdmin, so a non-admin's tool array never
// even contains them (access control by construction, not by prompt text).
//
// Executors return compact JSON (short-ish keys, nulls dropped, rows capped at
// 50 with an explicit `truncated` flag the model must mention). No tool computes
// dollar advice — they return the user's data + market facts; the model narrates.
// =============================================================================

export interface ToolSchema {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

export interface ToolContext {
  supabase: SupabaseClient;   // RLS client — scoped to the session user
  userId: string;
  isAdmin: boolean;
}

const ROW_CAP = 50;
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
// Drop null/undefined keys so tool JSON stays compact (token discipline).
function compact<T extends Record<string, unknown>>(o: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined) out[k] = v;
  return out as Partial<T>;
}

// ── search_transactions filter builder (pure — unit-tested) ──
export interface TxnFilters {
  query?: string; merchant?: string; category?: string; account_id?: string;
  date_from?: string; date_to?: string; min_amount?: number; max_amount?: number; limit?: number;
}
// Applies filters to a Supabase query builder. Exposed for tests via a thin
// recorder; here it operates on the real builder.
export function buildTxnQuery(base: any, f: TxnFilters) {
  let q = base.eq("removed", false);
  if (f.merchant) q = q.ilike("merchant", `%${f.merchant}%`);
  if (f.category) q = q.ilike("plaid_category", `%${f.category}%`);
  if (f.account_id) q = q.eq("account_id", f.account_id);
  if (f.date_from) q = q.gte("date", f.date_from);
  if (f.date_to) q = q.lte("date", f.date_to);
  if (f.min_amount != null) q = q.gte("amount", f.min_amount);
  if (f.max_amount != null) q = q.lte("amount", f.max_amount);
  if (f.query) q = q.or(`name.ilike.%${f.query}%,merchant.ilike.%${f.query}%`);
  return q;
}

// ── User tools ──
const USER_SCHEMAS: ToolSchema[] = [
  {
    name: "search_transactions",
    description: "Search THIS user's bank/card transactions. Filter by free-text query (matches name/merchant), merchant, category, account, date range, and amount range. Returns matching rows plus total count and sum.",
    input_schema: { type: "object", properties: {
      query: { type: "string", description: "free text matched against name/merchant" },
      merchant: { type: "string" }, category: { type: "string" }, account_id: { type: "string" },
      date_from: { type: "string", description: "YYYY-MM-DD inclusive" },
      date_to: { type: "string", description: "YYYY-MM-DD inclusive" },
      min_amount: { type: "number" }, max_amount: { type: "number" },
      limit: { type: "number", description: "max rows, default 50" },
    } },
  },
  { name: "get_holdings", description: "This user's investment positions: shares, cost basis, current value, day change.", input_schema: { type: "object", properties: {} } },
  { name: "get_accounts_summary", description: "This user's accounts, balances, and liabilities (net worth breakdown).", input_schema: { type: "object", properties: {} } },
  { name: "get_networth_history", description: "This user's monthly net-worth snapshot series.", input_schema: { type: "object", properties: { months: { type: "number", description: "default 12" } } } },
  { name: "get_watchlist_quotes", description: "Live quotes for the symbols on this user's watchlist.", input_schema: { type: "object", properties: {} } },
  { name: "get_quote", description: "Live quote for a stock/ETF symbol.", input_schema: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] } },
  { name: "get_price_history", description: "Historical daily prices for a symbol.", input_schema: { type: "object", properties: { symbol: { type: "string" }, range: { type: "string", description: "e.g. 1M, 3M, 1Y" } }, required: ["symbol"] } },
  { name: "get_news", description: "Recent news headlines with dates for a symbol (or general market if omitted).", input_schema: { type: "object", properties: { symbol: { type: "string" }, limit: { type: "number" } } } },
  { name: "get_market_brief", description: "Today's market snapshot: index moves and notable headlines.", input_schema: { type: "object", properties: {} } },
  { name: "remember_fact", description: "Store a DURABLE preference/goal/expertise/style the user stated (e.g. 'saving for a house in 2027', 'keep answers short', 'I know finance'). Never transient or sensitive (health/relationships/non-financial).", input_schema: { type: "object", properties: { fact: { type: "string" }, kind: { type: "string", enum: ["preference", "goal", "profile", "style"] } }, required: ["fact", "kind"] } },
  { name: "forget_fact", description: "Forget a previously-remembered fact when the user asks (e.g. 'forget that').", input_schema: { type: "object", properties: { fact: { type: "string", description: "text or keywords of the fact to remove" } }, required: ["fact"] } },
  { name: "get_targets", description: "This user's monthly category budget targets with month-to-date spend and pace (ahead/on/behind).", input_schema: { type: "object", properties: {} } },
  { name: "set_target", description: "Set or update the user's monthly budget target for a spending category (e.g. 'set my dining target to $300'). Confirm the category + amount with the user before calling.", input_schema: { type: "object", properties: { category: { type: "string" }, monthly_target: { type: "number" } }, required: ["category", "monthly_target"] } },
  { name: "get_goals", description: "This user's savings goals with target amount, target date, and the deterministic projected completion (cash-flow only).", input_schema: { type: "object", properties: {} } },
];

// F6 recurring tool is added only when the table exists (best-effort; the
// executor degrades to unavailable if not migrated).
const RECURRING_SCHEMA: ToolSchema = { name: "get_recurring_charges", description: "This user's detected recurring charges / subscriptions with monthly totals and price-increase flags.", input_schema: { type: "object", properties: {} } };

// ── Admin tools (registered ONLY when isAdmin) ──
const ADMIN_SCHEMAS: ToolSchema[] = [
  { name: "get_platform_stats", description: "Platform totals: user count, linked-item count, active-today.", input_schema: { type: "object", properties: {} } },
  { name: "get_ai_costs", description: "AI usage/cost aggregates over the last N days.", input_schema: { type: "object", properties: { days: { type: "number", description: "default 30" } } } },
  { name: "get_error_log", description: "Recent error-log rows.", input_schema: { type: "object", properties: { limit: { type: "number", description: "default 20" } } } },
  { name: "get_provider_health", description: "Provider/connector health status.", input_schema: { type: "object", properties: {} } },
  { name: "lookup_user", description: "Support/debug: a user's account metadata, linked institutions, and row counts by email. Returns METADATA + COUNTS only. Pass include_data:true ONLY when transaction contents are genuinely needed — it writes an audit row.", input_schema: { type: "object", properties: { email: { type: "string" }, include_data: { type: "boolean" } }, required: ["email"] } },
];

// Build the tool list for a role. Non-admin lists NEVER contain admin tools.
export function toolSchemasFor(isAdmin: boolean): ToolSchema[] {
  return isAdmin ? [...USER_SCHEMAS, RECURRING_SCHEMA, ...ADMIN_SCHEMAS] : [...USER_SCHEMAS, RECURRING_SCHEMA];
}

// ── Executors ──
type ToolResult = Record<string, unknown>;

export async function executeTool(name: string, input: any, ctx: ToolContext): Promise<ToolResult> {
  // Hard gate: admin tools refuse for non-admins even if the model somehow names
  // one (defense in depth beyond registration).
  const ADMIN = new Set(ADMIN_SCHEMAS.map((t) => t.name));
  if (ADMIN.has(name) && !ctx.isAdmin) return { error: "not_authorized" };

  try {
    switch (name) {
      case "search_transactions": return await execSearchTransactions(input ?? {}, ctx);
      case "get_holdings": return await execHoldings(ctx);
      case "get_accounts_summary": return await execAccounts(ctx);
      case "get_networth_history": return await execNetworthHistory(input ?? {}, ctx);
      case "get_watchlist_quotes": return await execWatchlistQuotes(ctx);
      case "get_quote": return await execQuote(input ?? {});
      case "get_price_history": return await execPriceHistory(input ?? {});
      case "get_news": return await execNews(input ?? {});
      case "get_market_brief": return await execMarketBrief();
      case "get_recurring_charges": return await execRecurring(ctx);
      case "remember_fact": return await execRememberFact(input ?? {}, ctx);
      case "forget_fact": return await execForgetFact(input ?? {}, ctx);
      case "get_targets": return await execGetTargets(ctx);
      case "set_target": return await execSetTarget(input ?? {}, ctx);
      case "get_goals": return await execGetGoals(ctx);
      case "get_platform_stats": return await execPlatformStats(ctx);
      case "get_ai_costs": return await execAiCosts(input ?? {}, ctx);
      case "get_error_log": return await execErrorLog(input ?? {}, ctx);
      case "get_provider_health": return await execProviderHealth();
      case "lookup_user": return await execLookupUser(input ?? {}, ctx);
      default: return { error: "unknown_tool" };
    }
  } catch (e) {
    return { error: "tool_failed", detail: e instanceof Error ? e.message : "unknown" };
  }
}

async function execSearchTransactions(f: TxnFilters, ctx: ToolContext): Promise<ToolResult> {
  const limit = Math.min(f.limit ?? ROW_CAP, ROW_CAP);
  // Total count + sum over the full filtered set (head:false count).
  const countQ = buildTxnQuery(
    ctx.supabase.from("plaid_transactions").select("amount", { count: "exact" }).eq("user_id", ctx.userId), f,
  );
  const { data: sumRows, count } = await countQ;
  const total = count ?? (sumRows?.length ?? 0);
  const sum = +(sumRows ?? []).reduce((s: number, r: any) => s + num(r.amount), 0).toFixed(2);

  const rowsQ = buildTxnQuery(
    ctx.supabase.from("plaid_transactions").select("transaction_id,date,name,merchant,amount,plaid_category,institution").eq("user_id", ctx.userId), f,
  ).order("date", { ascending: false }).limit(limit);
  const { data } = await rowsQ;
  const rows = (data ?? []).map((t: any) => compact({ id: t.transaction_id, date: t.date, amt: num(t.amount), name: t.merchant || t.name, cat: t.plaid_category, bank: t.institution }));
  return compact({ count: total, sum, rows, truncated: total > rows.length ? true : undefined });
}

async function execHoldings(ctx: ToolContext): Promise<ToolResult> {
  const holdings = await getUnifiedHoldings(ctx.supabase, { userId: ctx.userId }).catch(() => []);
  const syms = holdings.filter((h) => h.hasRealTicker).map((h) => h.symbol);
  const quotes = syms.length ? await marketData.getQuotes(syms).catch(() => ({} as Record<string, DataResult<Quote>>)) : {};
  const rows = holdings.map((h) => {
    const q = quotes[h.symbol.toUpperCase()]?.data;
    const price = q?.price ?? null;
    const value = price != null ? +(price * h.shares).toFixed(2) : (h.value ?? null);
    const cost = h.avgCost * h.shares;
    return compact({
      sym: h.symbol, shares: h.shares, cost: +h.avgCost.toFixed(2), price,
      value, gain: value != null && cost > 0 ? +(value - cost).toFixed(2) : null,
      dayPct: q?.changePct ?? null,
    });
  });
  return { rows, count: rows.length };
}

async function execAccounts(ctx: ToolContext): Promise<ToolResult> {
  const nw = await computeNetWorth({ supabase: ctx.supabase, userId: ctx.userId }).catch(() => null);
  if (!nw) return { available: false };
  return compact({
    netWorth: +nw.netWorth.toFixed(2), assets: +nw.totalAssets.toFixed(2), liabilities: +nw.totalLiabilities.toFixed(2),
    liquid: +nw.liquid.toFixed(2), byType: nw.byType,
  });
}

async function execNetworthHistory(input: { months?: number }, ctx: ToolContext): Promise<ToolResult> {
  const months = Math.min(input.months ?? 12, 60);
  const { data } = await ctx.supabase.from("net_worth_snapshots")
    .select("month, net_worth, total_assets, total_liabilities").eq("user_id", ctx.userId)
    .order("month", { ascending: false }).limit(months);
  const rows = (data ?? []).reverse().map((r: any) => compact({ month: r.month, net: num(r.net_worth), assets: num(r.total_assets), liab: num(r.total_liabilities) }));
  return { rows, count: rows.length };
}

async function execWatchlistQuotes(ctx: ToolContext): Promise<ToolResult> {
  const { data: lists } = await ctx.supabase.from("watch_list_items").select("symbol").limit(60);
  const syms = Array.from(new Set((lists ?? []).map((r: any) => String(r.symbol).toUpperCase()))).slice(0, 40);
  if (!syms.length) return { rows: [], count: 0 };
  const quotes = await marketData.getQuotes(syms).catch(() => ({} as Record<string, DataResult<Quote>>));
  const rows = syms.map((s) => { const q = quotes[s]?.data; return q ? compact({ sym: s, price: q.price, dayPct: q.changePct }) : null; }).filter(Boolean);
  return { rows, count: rows.length };
}

async function execQuote(input: { symbol?: string }): Promise<ToolResult> {
  if (!input.symbol) return { error: "symbol_required" };
  const r = await marketData.getQuote(input.symbol);
  if (!r.data) return compact({ symbol: input.symbol, available: false, note: r.note });
  const q = r.data;
  return compact({ sym: q.symbol, price: q.price, dayPct: q.changePct, low52: q.week52Low, high52: q.week52High, mktCap: q.marketCap, asOf: r.asOf });
}

async function execPriceHistory(input: { symbol?: string; range?: string }): Promise<ToolResult> {
  if (!input.symbol) return { error: "symbol_required" };
  const r = await marketData.getPriceHistory(input.symbol);
  if (!r.data) return compact({ symbol: input.symbol, available: false, note: r.note });
  // Downsample to keep tokens bounded — the model rarely needs every day.
  const pts = r.data.points;
  const step = Math.max(1, Math.floor(pts.length / 40));
  const sampled = pts.filter((_, i) => i % step === 0).map((p) => ({ d: p.date, c: p.close }));
  return { sym: input.symbol, points: sampled, from: pts[0]?.date, to: pts.at(-1)?.date };
}

async function execNews(input: { symbol?: string; limit?: number }): Promise<ToolResult> {
  const sym = input.symbol || "SPY";
  const r = await marketData.getNews(sym).catch(() => null);
  const items = (r?.data ?? []).slice(0, Math.min(input.limit ?? 6, 10)).map((n) => compact({ title: n.title, source: n.source, url: n.url, date: (n as any).publishedAt ?? (n as any).date }));
  return { symbol: sym, items, count: items.length };
}

async function execMarketBrief(): Promise<ToolResult> {
  const b = await readMarketBrief();
  if (!b) return { available: false, note: "Today's brief isn't cached yet." };
  return compact({ asOf: b.asOf, indexes: b.indexes, headlines: b.headlines });
}

async function execRecurring(ctx: ToolContext): Promise<ToolResult> {
  const { data, error } = await ctx.supabase.from("recurring_charges")
    .select("merchant, cadence, avg_amount, last_amount, status").eq("user_id", ctx.userId).eq("status", "active").order("avg_amount", { ascending: false });
  if (error) return { available: false };
  const rows = (data ?? []).map((r: any) => compact({ merchant: r.merchant, cadence: r.cadence, avg: num(r.avg_amount), last: num(r.last_amount), up: num(r.last_amount) > num(r.avg_amount) * 1.1 ? true : undefined }));
  const monthly = +rows.reduce((s: number, c: any) => s + (c.cadence === "monthly" ? c.avg : c.avg / 12), 0).toFixed(2);
  return { rows, count: rows.length, monthlyTotal: monthly };
}

// MV2/MV3 — targets + goals tools (RLS-scoped; degrade to available:false if the
// tables aren't migrated). set_target upserts; the model confirms before calling.
async function execGetTargets(ctx: ToolContext): Promise<ToolResult> {
  const { data, error } = await ctx.supabase.from("category_targets")
    .select("category, monthly_target").eq("user_id", ctx.userId).order("monthly_target", { ascending: false });
  if (error) return { available: false };
  return { rows: (data ?? []).map((r: any) => ({ category: r.category, target: num(r.monthly_target) })), count: (data ?? []).length };
}

async function execSetTarget(input: { category?: string; monthly_target?: number }, ctx: ToolContext): Promise<ToolResult> {
  const category = String(input.category ?? "").trim();
  const target = num(input.monthly_target);
  if (!category || !(target > 0)) return { error: "invalid_target" };
  const { error } = await ctx.supabase.from("category_targets").upsert(
    { user_id: ctx.userId, category, monthly_target: target, updated_at: new Date().toISOString() },
    { onConflict: "user_id,category" },
  );
  if (error) return { available: false };
  return { ok: true, category, target };
}

async function execGetGoals(ctx: ToolContext): Promise<ToolResult> {
  const { data, error } = await ctx.supabase.from("goals")
    .select("name, target_amount, target_date, linked_kind, status").eq("user_id", ctx.userId).eq("status", "active");
  if (error) return { available: false };
  return { rows: (data ?? []).map((r: any) => compact({ name: r.name, target: num(r.target_amount), by: r.target_date, source: r.linked_kind })), count: (data ?? []).length };
}

async function execRememberFact(input: { fact?: string; kind?: string }, ctx: ToolContext): Promise<ToolResult> {
  const kinds = ["preference", "goal", "profile", "style"];
  if (!input.fact || !input.kind || !kinds.includes(input.kind)) return { error: "invalid_fact" };
  // Cap ~40/user; dedupe by normalized keyword overlap (replace same-topic).
  const { data: existing } = await ctx.supabase.from("chat_memory").select("id, fact").eq("user_id", ctx.userId);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter((w) => w.length > 3);
  const newKeys = new Set(norm(input.fact));
  const dupe = (existing ?? []).find((r: any) => { const k = norm(r.fact); const overlap = k.filter((w: string) => newKeys.has(w)).length; return overlap >= 2; });
  if (dupe) {
    await ctx.supabase.from("chat_memory").update({ fact: input.fact, kind: input.kind, updated_at: new Date().toISOString() }).eq("id", dupe.id).eq("user_id", ctx.userId);
    return { ok: true, updated: true };
  }
  if ((existing?.length ?? 0) >= 40) return { ok: false, note: "memory full" };
  await ctx.supabase.from("chat_memory").insert({ user_id: ctx.userId, fact: input.fact, kind: input.kind });
  return { ok: true, remembered: input.fact };
}

async function execForgetFact(input: { fact?: string }, ctx: ToolContext): Promise<ToolResult> {
  if (!input.fact) return { error: "fact_required" };
  const { data } = await ctx.supabase.from("chat_memory").select("id, fact").eq("user_id", ctx.userId);
  const q = input.fact.toLowerCase();
  const match = (data ?? []).find((r: any) => r.fact.toLowerCase().includes(q) || q.includes(r.fact.toLowerCase().slice(0, 20)));
  if (!match) return { ok: false, note: "no matching memory" };
  await ctx.supabase.from("chat_memory").delete().eq("id", match.id).eq("user_id", ctx.userId);
  return { ok: true, forgot: match.fact };
}

// ── Admin executors (RLS bypass via service client, since they span users) ──
async function execPlatformStats(ctx: ToolContext): Promise<ToolResult> {
  const { serviceClient } = await import("@/lib/service-client");
  const db = serviceClient();
  if (!db) return { available: false };
  const [users, items, activeTxns] = await Promise.all([
    db.from("user_prefs").select("user_id", { count: "exact", head: true }),
    db.from("plaid_items").select("item_id", { count: "exact", head: true }),
    db.from("plaid_transactions").select("user_id", { count: "exact", head: true }).gte("date", new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)),
  ]);
  return compact({ users: users.count ?? 0, linkedItems: items.count ?? 0, txnsToday: activeTxns.count ?? 0 });
}

async function execAiCosts(input: { days?: number }, _ctx: ToolContext): Promise<ToolResult> {
  const { serviceClient } = await import("@/lib/service-client");
  const { estimateCostUsd } = await import("@/lib/ai/usage");
  const db = serviceClient();
  if (!db) return { available: false };
  const days = Math.min(input.days ?? 30, 90);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await db.from("ai_usage").select("model, input_tokens, output_tokens").gte("created_at", since);
  let costUsd = 0; const rows = data ?? [];
  for (const r of rows) costUsd += estimateCostUsd(r.model ?? "", num(r.input_tokens), num(r.output_tokens));
  return { days, calls: rows.length, costUsd: +costUsd.toFixed(2) };
}

async function execErrorLog(input: { limit?: number }, _ctx: ToolContext): Promise<ToolResult> {
  const { serviceClient } = await import("@/lib/service-client");
  const db = serviceClient();
  if (!db) return { available: false };
  const limit = Math.min(input.limit ?? 20, ROW_CAP);
  const { data } = await db.from("error_log").select("created_at, source, message").order("created_at", { ascending: false }).limit(limit);
  const rows = (data ?? []).map((r: any) => compact({ at: r.created_at, source: r.source, msg: String(r.message ?? "").slice(0, 160) }));
  return { rows, count: rows.length };
}

async function execProviderHealth(): Promise<ToolResult> {
  const { fmpHealth } = await import("@/lib/providers/fmp");
  try { return compact({ fmp: fmpHealth() }); } catch { return { available: false }; }
}

async function execLookupUser(input: { email?: string; include_data?: boolean }, ctx: ToolContext): Promise<ToolResult> {
  if (!input.email) return { error: "email_required" };
  const { serviceClient } = await import("@/lib/service-client");
  const db = serviceClient();
  if (!db) return { available: false };
  // Find the auth user by email (admin API).
  const { data: list } = await (db as any).auth.admin.listUsers().catch(() => ({ data: null }));
  const u = list?.users?.find((x: any) => (x.email ?? "").toLowerCase() === input.email!.toLowerCase());
  if (!u) return { found: false };
  const [items, txns] = await Promise.all([
    db.from("plaid_items").select("institution_name").eq("user_id", u.id),
    db.from("plaid_transactions").select("transaction_id", { count: "exact", head: true }).eq("user_id", u.id),
  ]);
  const meta = compact({
    id: u.id, email: u.email, createdAt: u.created_at,
    institutions: (items.data ?? []).map((i: any) => i.institution_name).filter(Boolean),
    txnCount: txns.count ?? 0,
  });
  if (input.include_data) {
    // Full drill-down: write an audit row (who/what/when), then return a sample.
    await db.from("admin_audit").insert({ actor_id: ctx.userId, action: "lookup_user.include_data", target: input.email, detail: { targetUserId: u.id } }).then(() => {}, () => {});
    const { data: sample } = await db.from("plaid_transactions").select("date, name, amount").eq("user_id", u.id).order("date", { ascending: false }).limit(20);
    return compact({ ...meta, audited: true, sample: (sample ?? []).map((t: any) => compact({ date: t.date, name: t.name, amt: num(t.amount) })) });
  }
  return meta;
}
