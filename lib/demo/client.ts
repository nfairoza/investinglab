import type { SupabaseClient } from "@supabase/supabase-js";
import { DEMO_TABLES, DEMO_USER } from "./fixtures";

// A minimal, in-memory stand-in for the Supabase client used ONLY in demo mode.
// It implements the slice of the query-builder surface the app actually calls
// (select/eq/in/order/limit/maybeSingle + insert/update/delete/upsert), reads
// from the demo fixtures, and treats every WRITE as a no-op. It never opens a
// network connection, so a demo visitor can click anything without touching the
// real database.
//
// Not a general Supabase emulator — just enough for the read paths the app uses.

type Row = Record<string, any>;
interface Result<T = any> { data: T; error: null; count: number | null }

interface Filter { op: "eq" | "neq" | "in" | "gte" | "lte" | "gt" | "lt"; col: string; val: any }

class DemoQuery implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private limitN: number | null = null;
  private headOnly = false;
  private wantCount = false;
  private mode: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private writePayload: Row[] = [];

  constructor(private table: string) {}

  private rows(): Row[] {
    return (DEMO_TABLES[this.table] ?? []).slice();
  }

  // ── read builders ──
  select(_cols?: string, opts?: { count?: string; head?: boolean }): DemoQuery {
    if (this.mode === "select") this.mode = "select";
    if (opts?.head) this.headOnly = true;
    if (opts?.count) this.wantCount = true;
    return this;
  }
  eq(col: string, val: any): DemoQuery { this.filters.push({ op: "eq", col, val }); return this; }
  neq(col: string, val: any): DemoQuery { this.filters.push({ op: "neq", col, val }); return this; }
  in(col: string, val: any[]): DemoQuery { this.filters.push({ op: "in", col, val }); return this; }
  gte(col: string, val: any): DemoQuery { this.filters.push({ op: "gte", col, val }); return this; }
  lte(col: string, val: any): DemoQuery { this.filters.push({ op: "lte", col, val }); return this; }
  gt(col: string, val: any): DemoQuery { this.filters.push({ op: "gt", col, val }); return this; }
  lt(col: string, val: any): DemoQuery { this.filters.push({ op: "lt", col, val }); return this; }
  order(col: string, opts?: { ascending?: boolean }): DemoQuery { this.orderBy = { col, asc: opts?.ascending !== false }; return this; }
  limit(n: number): DemoQuery { this.limitN = n; return this; }

  // ── write builders (no-op; return a chainable so .select().maybeSingle() works) ──
  insert(payload: Row | Row[]): DemoQuery { this.mode = "insert"; this.writePayload = Array.isArray(payload) ? payload : [payload]; return this; }
  update(payload: Row): DemoQuery { this.mode = "update"; this.writePayload = [payload]; return this; }
  upsert(payload: Row | Row[], _opts?: { onConflict?: string }): DemoQuery { this.mode = "upsert"; this.writePayload = Array.isArray(payload) ? payload : [payload]; return this; }
  delete(): DemoQuery { this.mode = "delete"; return this; }

  private apply(): Row[] {
    let rows = this.rows();
    for (const f of this.filters) {
      rows = rows.filter((r) => {
        const v = r[f.col];
        switch (f.op) {
          case "eq": return v === f.val;
          case "neq": return v !== f.val;
          case "in": return Array.isArray(f.val) && f.val.includes(v);
          case "gte": return v >= f.val;
          case "lte": return v <= f.val;
          case "gt": return v > f.val;
          case "lt": return v < f.val;
        }
      });
    }
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      rows.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1));
    }
    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    return rows;
  }

  // For an insert/upsert that chains .select().maybeSingle(), echo the written
  // payload with a synthetic id so the caller gets a plausible row back. The data
  // is NOT persisted (writes are no-ops), so it won't appear on later reads.
  private writeResult(): Row[] {
    return this.writePayload.map((p, i) => ({ id: p.id ?? `demo_${i}`, ...p }));
  }

  async maybeSingle(): Promise<Result<Row | null>> {
    if (this.mode !== "select") { const w = this.writeResult(); return { data: w[0] ?? null, error: null, count: null }; }
    const rows = this.apply();
    return { data: rows[0] ?? null, error: null, count: null };
  }
  async single(): Promise<Result<Row | null>> { return this.maybeSingle(); }

  private resolve(): Result {
    if (this.mode !== "select") {
      // Writes: no-op. Return the echoed payload so insert().select() chains work.
      return { data: this.writeResult(), error: null, count: null };
    }
    const rows = this.apply();
    if (this.headOnly) return { data: null, error: null, count: rows.length };
    return { data: rows, error: null, count: this.wantCount ? rows.length : null };
  }

  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.resolve()).then(onfulfilled, onrejected);
  }
}

// The demo "user" shaped like a Supabase auth user (no admin role).
const demoAuthUser = {
  id: DEMO_USER.id,
  email: DEMO_USER.email,
  app_metadata: { provider: "demo" },
  user_metadata: { full_name: DEMO_USER.fullName },
  created_at: "2026-01-01T00:00:00.000Z",
  phone: null,
};

// Build the fake client. Cast to SupabaseClient at the boundary — it implements
// only the subset the app touches, which is all demo code paths need.
export function demoSupabase(): SupabaseClient {
  const client = {
    from(table: string) { return new DemoQuery(table); },
    auth: {
      async getUser() { return { data: { user: demoAuthUser }, error: null }; },
      async signOut() { return { error: null }; },
    },
  };
  return client as unknown as SupabaseClient;
}

export { demoAuthUser };
