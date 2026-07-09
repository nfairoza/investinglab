import { describe, it, expect } from "vitest";
import { toolSchemasFor, buildTxnQuery, executeTool, type ToolContext, type TxnFilters } from "@/lib/chat/tools";

// C7 — tool scoping: role decides REGISTRATION. A non-admin's tool list must not
// contain any admin tool (assert on the array, not on model output).
const ADMIN_TOOLS = ["get_platform_stats", "get_ai_costs", "get_error_log", "get_provider_health", "lookup_user"];

describe("toolSchemasFor (role scoping)", () => {
  it("non-admin list excludes every admin tool", () => {
    const names = toolSchemasFor(false).map((t) => t.name);
    for (const a of ADMIN_TOOLS) expect(names).not.toContain(a);
    // But user tools are present.
    expect(names).toContain("search_transactions");
    expect(names).toContain("get_holdings");
    expect(names).toContain("remember_fact");
  });
  it("admin list includes admin tools plus all user tools", () => {
    const names = toolSchemasFor(true).map((t) => t.name);
    for (const a of ADMIN_TOOLS) expect(names).toContain(a);
    expect(names).toContain("search_transactions");
  });
});

// ── buildTxnQuery: assert it applies exactly the right filters. We pass a
// recorder that logs each builder call and returns itself (chainable). ──
function recorder() {
  const calls: { fn: string; args: any[] }[] = [];
  const proxy: any = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === "__calls") return calls;
      return (...args: any[]) => { calls.push({ fn: prop, args }); return proxy; };
    },
  });
  return proxy;
}

describe("buildTxnQuery (filter building)", () => {
  it("builds merchant + date range + amount filters", () => {
    const rec = recorder();
    const f: TxnFilters = { merchant: "Costco", date_from: "2026-06-01", date_to: "2026-06-30", min_amount: 10 };
    buildTxnQuery(rec, f);
    const calls = rec.__calls as { fn: string; args: any[] }[];
    // Always filters removed=false first.
    expect(calls[0]).toEqual({ fn: "eq", args: ["removed", false] });
    expect(calls).toContainEqual({ fn: "ilike", args: ["merchant", "%Costco%"] });
    expect(calls).toContainEqual({ fn: "gte", args: ["date", "2026-06-01"] });
    expect(calls).toContainEqual({ fn: "lte", args: ["date", "2026-06-30"] });
    expect(calls).toContainEqual({ fn: "gte", args: ["amount", 10] });
  });
  it("free-text query does an OR ilike on name+merchant", () => {
    const rec = recorder();
    buildTxnQuery(rec, { query: "coffee" });
    const calls = rec.__calls as { fn: string; args: any[] }[];
    expect(calls).toContainEqual({ fn: "or", args: ["name.ilike.%coffee%,merchant.ilike.%coffee%"] });
  });
});

// ── executeTool: admin tools refuse for non-admins even if named directly. ──
describe("executeTool (defense in depth)", () => {
  const nonAdminCtx: ToolContext = { supabase: {} as any, userId: "u1", isAdmin: false };
  it("refuses an admin tool for a non-admin", async () => {
    const r = await executeTool("get_platform_stats", {}, nonAdminCtx);
    expect(r).toEqual({ error: "not_authorized" });
  });
  it("unknown tool returns an error, not a throw", async () => {
    const r = await executeTool("does_not_exist", {}, nonAdminCtx);
    expect(r).toEqual({ error: "unknown_tool" });
  });
  it("get_quote without a symbol returns a structured error (no hallucinated number)", async () => {
    const r = await executeTool("get_quote", {}, nonAdminCtx);
    expect(r).toEqual({ error: "symbol_required" });
  });
});

// ── Eval fixture: canned Q → the tool that SHOULD serve it. We assert the
// expected tool exists in the (user) registry — the contract the model selects
// from. Persona checks live in chat-persona.test.ts. ──
describe("tool-selection eval fixture", () => {
  const cases: { q: string; tool: string }[] = [
    { q: "what did I spend at Costco in June", tool: "search_transactions" },
    { q: "how's my portfolio today", tool: "get_holdings" },
    { q: "what's my net worth trend", tool: "get_networth_history" },
    { q: "how's my watchlist doing", tool: "get_watchlist_quotes" },
    { q: "what's NVDA trading at", tool: "get_quote" },
    { q: "what's moving the market today", tool: "get_market_brief" },
    { q: "any news on TSLA", tool: "get_news" },
    { q: "what are my balances", tool: "get_accounts_summary" },
  ];
  const userTools = new Set(toolSchemasFor(false).map((t) => t.name));
  for (const c of cases) {
    it(`"${c.q}" → ${c.tool} is available`, () => {
      expect(userTools.has(c.tool)).toBe(true);
    });
  }
});
