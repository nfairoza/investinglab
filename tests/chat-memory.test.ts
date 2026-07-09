import { describe, it, expect } from "vitest";
import { executeTool, type ToolContext } from "@/lib/chat/tools";
import { buildChatSystem } from "@/lib/chat/system";

// A tiny fake Supabase supporting the chat_memory calls the executors make:
// .from().select().eq()  → { data }
// .from().insert(row)
// .from().update().eq().eq()
// .from().delete().eq().eq()
function fakeSupabase(seed: any[] = []) {
  const store = { rows: seed.slice() };
  function from(_table: string) {
    let pending: any = null;
    const api: any = {
      select() { return api; },
      eq() { return api; },
      order() { return api; },
      limit() { return api; },
      insert(row: any) { store.rows.push({ id: `id${store.rows.length + 1}`, ...row }); return Promise.resolve({ error: null }); },
      update(patch: any) { pending = { op: "update", patch }; return api; },
      delete() { pending = { op: "delete" }; return api; },
      maybeSingle() { return Promise.resolve({ data: store.rows[0] ?? null }); },
      then(res: any) {
        // Terminal await for select (returns all rows) or pending update/delete.
        if (pending?.op === "update") { store.rows = store.rows.map((r) => r); return res({ data: null, error: null }); }
        if (pending?.op === "delete") { return res({ data: null, error: null }); }
        return res({ data: store.rows, count: store.rows.length });
      },
    };
    return api;
  }
  return { from } as any;
}

const ctx = (supabase: any): ToolContext => ({ supabase, userId: "u1", isAdmin: false });

describe("remember_fact", () => {
  it("rejects a kind outside the enum", async () => {
    const r = await executeTool("remember_fact", { fact: "likes dividends", kind: "mood" }, ctx(fakeSupabase()));
    expect(r).toEqual({ error: "invalid_fact" });
  });
  it("rejects an empty fact", async () => {
    const r = await executeTool("remember_fact", { fact: "", kind: "preference" }, ctx(fakeSupabase()));
    expect(r).toEqual({ error: "invalid_fact" });
  });
  it("stores a valid durable fact", async () => {
    const r = await executeTool("remember_fact", { fact: "saving for a house in 2027", kind: "goal" }, ctx(fakeSupabase()));
    expect(r).toMatchObject({ ok: true });
  });
  it("enforces the ~40-fact cap", async () => {
    const seed = Array.from({ length: 40 }, (_, i) => ({ id: `f${i}`, fact: `unrelated topic number ${i} alpha bravo`, kind: "preference" }));
    const r = await executeTool("remember_fact", { fact: "wants aggressive growth strategy always", kind: "preference" }, ctx(fakeSupabase(seed)));
    expect(r).toMatchObject({ ok: false });
  });
});

describe("forget_fact", () => {
  it("deletes a matching fact", async () => {
    const seed = [{ id: "f1", fact: "I hate crypto", kind: "preference" }];
    const r = await executeTool("forget_fact", { fact: "crypto" }, ctx(fakeSupabase(seed)));
    expect(r).toMatchObject({ ok: true });
  });
  it("reports when nothing matches", async () => {
    const r = await executeTool("forget_fact", { fact: "nonexistent" }, ctx(fakeSupabase([])));
    expect(r).toMatchObject({ ok: false });
  });
});

// C3 persona checks baked into the system prompt (the register + legal lines).
describe("system prompt persona (C3)", () => {
  const sys = buildChatSystem({ holdings: [], watchlist: [], currentPage: "/", isAdmin: false }, []);
  it("forbids directive buy/sell advice and the advisor label", () => {
    expect(sys).toMatch(/never call yourself a financial advisor/i);
    expect(sys).toMatch(/never give directive personal investment instructions/i);
  });
  it("mandates tool-sourced numbers (no estimation)", () => {
    expect(sys).toMatch(/must come from a tool result, never memory or estimation/i);
  });
  it("injects remembered facts when present", () => {
    const withMem = buildChatSystem({ holdings: [], watchlist: [], currentPage: "/", isAdmin: false }, [{ fact: "expert, skip basics", kind: "profile" }]);
    expect(withMem).toMatch(/WHAT YOU KNOW ABOUT THIS USER/);
    expect(withMem).toMatch(/expert, skip basics/);
  });
  it("non-admin prompt carries the guardrails; admin prompt carries platform-tool note", () => {
    expect(sys).toMatch(/ACCESS: STANDARD USER/);
    const admin = buildChatSystem({ holdings: [], watchlist: [], currentPage: "/", isAdmin: true }, []);
    expect(admin).toMatch(/ACCESS: ADMIN/);
    expect(admin).toMatch(/platform-level tools/i);
  });
});
