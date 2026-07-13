import { describe, it, expect, vi, beforeEach } from "vitest";

// ALERTDEL AD3 — escalation behavior. We drive runAlertEscalation() against a
// hand-rolled fake Supabase + mocked email sender so we can assert exactly which
// deliveries get batched, that it's one email per user, idempotent, and
// toggle-gated. All timers are injected via nowMs.

const sendAlertEmail = vi.fn(async () => ({ sent: true }));
const resolveUserEmail = vi.fn(async (_db: unknown, userId: string) => `${userId}@example.com`);
vi.mock("@/lib/alerts/email", () => ({
  sendAlertEmail: (...a: unknown[]) => (sendAlertEmail as any)(...a),
  resolveUserEmail: (...a: unknown[]) => (resolveUserEmail as any)(...a),
}));

// The fake DB: a mutable table of alert_deliveries + a user_prefs map. The query
// builder supports the exact chain runAlertEscalation uses.
interface Delivery {
  id: string; user_id: string; severity: number;
  push_sent_at: string | null; push_seen_at: string | null; email_sent_at: string | null;
  payload: { title?: string; body?: string; url?: string } | null;
  outcomes?: Record<string, unknown>;
}
let deliveries: Delivery[] = [];
let prefs: Record<string, { notifyPrefs?: { missedAlertEmail?: boolean } }> = {};

function makeFakeDb() {
  return {
    from(table: string) {
      if (table === "user_prefs") {
        let uid = "";
        const b: any = {
          select() { return b; },
          eq(_c: string, v: string) { uid = v; return b; },
          async maybeSingle() { return { data: prefs[uid] ? { prefs: prefs[uid] } : null }; },
        };
        return b;
      }
      // alert_deliveries
      const filters: ((d: Delivery) => boolean)[] = [];
      let mode: "select" | "update" = "select";
      let patch: Partial<Delivery> = {};
      let inIds: string[] | null = null;
      const b: any = {
        select() { return b; },
        update(p: Partial<Delivery>) { mode = "update"; patch = p; return b; },
        eq(col: string, v: unknown) { filters.push((d) => (d as any)[col] === v); return b; },
        is(col: string, v: null) { filters.push((d) => (d as any)[col] === v); return b; },
        not(col: string, _op: string, v: null) { filters.push((d) => (d as any)[col] !== v); return b; },
        lte(col: string, v: string) { filters.push((d) => (d as any)[col] != null && (d as any)[col] <= v); return b; },
        in(col: string, vals: string[]) { inIds = vals; filters.push((d) => vals.includes((d as any)[col])); return b; },
        then(resolve: (r: { data: Delivery[] }) => void) {
          const rows = deliveries.filter((d) => filters.every((f) => f(d)));
          if (mode === "update") for (const d of rows) Object.assign(d, patch);
          resolve({ data: rows.map((d) => ({ ...d })) });
        },
      };
      void inIds;
      return b;
    },
  };
}

vi.mock("@/lib/service-client", () => ({ serviceClient: () => makeFakeDb() }));

const NOW = Date.parse("2026-07-13T18:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

let runAlertEscalation: typeof import("@/lib/alerts/escalate").runAlertEscalation;

beforeEach(async () => {
  deliveries = [];
  prefs = {};
  sendAlertEmail.mockClear();
  resolveUserEmail.mockClear();
  ({ runAlertEscalation } = await import("@/lib/alerts/escalate"));
});

function d(over: Partial<Delivery>): Delivery {
  return { id: over.id ?? "d1", user_id: "u1", severity: 1, push_sent_at: hoursAgo(3), push_seen_at: null, email_sent_at: null, payload: { title: "AAPL alert", body: "crossed 200" }, ...over };
}

describe("runAlertEscalation", () => {
  it("escalates a sev-1 unseen 3h delivery: emails once, then does NOT re-fire", async () => {
    deliveries = [d({ id: "d1" })];
    const r1 = await runAlertEscalation(NOW);
    expect(r1.emailed).toBe(1);
    expect(sendAlertEmail).toHaveBeenCalledTimes(1);
    expect(deliveries[0].email_sent_at).not.toBeNull(); // stamped → won't re-scan

    sendAlertEmail.mockClear();
    const r2 = await runAlertEscalation(NOW + 5 * 60_000); // next tick
    expect(r2.candidates).toBe(0);
    expect(sendAlertEmail).not.toHaveBeenCalled();
  });

  it("does NOT escalate a delivery seen within the window", async () => {
    deliveries = [d({ id: "d1", push_seen_at: hoursAgo(1) })];
    const r = await runAlertEscalation(NOW);
    expect(r.candidates).toBe(0);
    expect(sendAlertEmail).not.toHaveBeenCalled();
  });

  it("does NOT escalate before 2h have passed", async () => {
    deliveries = [d({ id: "d1", push_sent_at: hoursAgo(1) })]; // only 1h unseen
    const r = await runAlertEscalation(NOW);
    expect(r.candidates).toBe(0);
  });

  it("batches TWO unseen deliveries for one user into exactly ONE email", async () => {
    deliveries = [d({ id: "d1" }), d({ id: "d2", payload: { title: "TSLA alert", body: "crossed 250" } })];
    const r = await runAlertEscalation(NOW);
    expect(r.candidates).toBe(2);
    expect(r.users).toBe(1);
    expect(sendAlertEmail).toHaveBeenCalledTimes(1);
    // The single email carries both items.
    const items = (sendAlertEmail.mock.calls[0] as any[])[1];
    expect(items).toHaveLength(2);
    expect(deliveries.every((x) => x.email_sent_at != null)).toBe(true);
  });

  it("respects the OFF toggle: never emails, but stamps so it won't rescan forever", async () => {
    prefs = { u1: { notifyPrefs: { missedAlertEmail: false } } };
    deliveries = [d({ id: "d1" })];
    const r = await runAlertEscalation(NOW);
    expect(sendAlertEmail).not.toHaveBeenCalled();
    expect(r.emailed).toBe(0);
    expect(deliveries[0].email_sent_at).not.toBeNull(); // suppressed but stamped
    expect(deliveries[0].outcomes?.escalation).toBe("skip:opted_out");
  });

  it("one email per user across multiple users", async () => {
    deliveries = [d({ id: "d1", user_id: "u1" }), d({ id: "d2", user_id: "u2" })];
    const r = await runAlertEscalation(NOW);
    expect(r.users).toBe(2);
    expect(sendAlertEmail).toHaveBeenCalledTimes(2);
  });
});
