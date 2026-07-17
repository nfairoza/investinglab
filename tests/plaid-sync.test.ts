import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mocks (hoisted so the vi.mock factories can reference them safely) ----
const { transactionsSync, deliveries } = vi.hoisted(() => ({
  transactionsSync: vi.fn(),
  deliveries: [] as any[],
}));
vi.mock("@/lib/plaid", () => ({
  getPlaid: () => ({ transactionsSync, accountsBalanceGet: vi.fn(async () => ({ data: { accounts: [] } })) }),
  resolvePlaidToken: (r: any) => r.access_token ?? "tok",
  selectPlaidItems: vi.fn(async () => ({ rows: [], error: null })),
}));

vi.mock("@/lib/alerts/delivery", () => ({
  recordDelivery: vi.fn(async (_db: any, input: any) => { deliveries.push(input); return { deliveryId: "d", push: "ok", email: "n/a" }; }),
}));

vi.mock("@/lib/plaid-snapshot", () => ({
  readSnapshots: vi.fn(async () => []),
  writeSnapshot: vi.fn(async () => {}),
  SNAPSHOT_TTL_MS: 6 * 60 * 60 * 1000,
}));

const { buildAndPersistForUser } = vi.hoisted(() => ({
  buildAndPersistForUser: vi.fn(async () => ({ ledgerBuilt: true, insightsCreated: 0, monthsOfData: 3 })),
}));
vi.mock("@/lib/insights/run", () => ({ buildAndPersistForUser }));
vi.mock("@/lib/money/rates", () => ({ readCachedRate: vi.fn(async () => null) }));

import { syncItem, syncAllItems, isReauthError, type ItemRow } from "@/lib/plaid/sync";

// A fake supabase that records upserts/updates by table.
function fakeDb() {
  const calls: Record<string, any[]> = { txnUpsert: [], txnUpdate: [], itemUpdate: [] };
  const db = {
    from(table: string) {
      if (table === "plaid_transactions") {
        return {
          upsert: (rows: any[]) => { calls.txnUpsert.push(rows); return Promise.resolve({ error: null }); },
          update: (patch: any) => ({ eq: () => ({ in: (_c: string, ids: string[]) => { calls.txnUpdate.push({ patch, ids }); return Promise.resolve({ error: null }); } }) }),
        };
      }
      if (table === "plaid_items") {
        return { update: (patch: any) => ({ eq: () => ({ eq: () => { calls.itemUpdate.push(patch); return Promise.resolve({ error: null }); } }) }) };
      }
      return { select: () => ({ data: [] }) };
    },
  } as any;
  return { db, calls };
}

const item = (over: Partial<ItemRow> = {}): ItemRow => ({ item_id: "it1", institution_name: "Chase", cursor: null, status: "active", access_token: "tok", ...over });

function plaidError(code: string) {
  return { response: { data: { error_code: code } } };
}

beforeEach(() => { transactionsSync.mockReset(); deliveries.length = 0; buildAndPersistForUser.mockClear(); });

describe("isReauthError", () => {
  it("matches the ITEM_LOGIN_REQUIRED family", () => {
    expect(isReauthError("ITEM_LOGIN_REQUIRED")).toBe(true);
    expect(isReauthError("PENDING_EXPIRATION")).toBe(true);
    expect(isReauthError("RATE_LIMIT_EXCEEDED")).toBe(false);
    expect(isReauthError(null)).toBe(false);
  });
});

describe("syncItem — cursor pagination + modified/removed", () => {
  it("pages until has_more=false, upserts added+modified, marks removed, advances cursor", async () => {
    transactionsSync
      .mockResolvedValueOnce({ data: { added: [txn("a1")], modified: [], removed: [], next_cursor: "c1", has_more: true } })
      .mockResolvedValueOnce({ data: { added: [txn("a2")], modified: [txn("a1")], removed: [{ transaction_id: "old1" }], next_cursor: "c2", has_more: false } });
    const { db, calls } = fakeDb();
    const r = await syncItem(db, "u1", item());
    // Two pages consumed.
    expect(transactionsSync).toHaveBeenCalledTimes(2);
    // added(a1)+added(a2)+modified(a1) = 3 upserted rows total across pages.
    const upserted = calls.txnUpsert.flat();
    expect(upserted.length).toBe(3);
    // removed marked.
    expect(calls.txnUpdate[0].ids).toEqual(["old1"]);
    // cursor advanced to the last next_cursor + last_synced_at stamped.
    const lastPatch = calls.itemUpdate.at(-1);
    expect(lastPatch.cursor).toBe("c2");
    expect(lastPatch.last_synced_at).toBeTruthy();
    expect(r.status).toBe("active");
    expect(r.added).toBe(3);
    expect(r.removed).toBe(1);
  });
});

describe("syncItem — ITEM_LOGIN_REQUIRED handling", () => {
  it("flips status to reauth_required, records error_code, delivers a severity-2 nudge", async () => {
    transactionsSync.mockRejectedValueOnce(plaidError("ITEM_LOGIN_REQUIRED"));
    const { db, calls } = fakeDb();
    const r = await syncItem(db, "u1", item());
    expect(r.status).toBe("reauth_required");
    expect(r.errorCode).toBe("ITEM_LOGIN_REQUIRED");
    // Item flagged with status + error_code + status_changed_at.
    const flag = calls.itemUpdate.at(-1);
    expect(flag.status).toBe("reauth_required");
    expect(flag.error_code).toBe("ITEM_LOGIN_REQUIRED");
    expect(flag.status_changed_at).toBeTruthy();
    // A severity-2 delivery went out, deduped per item.
    expect(deliveries.length).toBe(1);
    expect(deliveries[0].severity).toBe(2);
    expect(deliveries[0].kind).toBe("plaid_reauth");
    expect(deliveries[0].dedupeKey).toBe("plaid_reauth:it1");
  });

  it("a successful sync of a previously-reauth item clears status back to active", async () => {
    transactionsSync.mockResolvedValueOnce({ data: { added: [txn("a1")], modified: [], removed: [], next_cursor: "c1", has_more: false } });
    const { db, calls } = fakeDb();
    const r = await syncItem(db, "u1", item({ status: "reauth_required" }));
    expect(r.status).toBe("active");
    const patch = calls.itemUpdate.at(-1);
    expect(patch.status).toBe("active");
    expect(patch.error_code).toBeNull();
  });

  it("does NOT re-stamp status_changed_at when already reauth_required (paused-since stays original)", async () => {
    transactionsSync.mockRejectedValueOnce(plaidError("ITEM_LOGIN_REQUIRED"));
    const { db, calls } = fakeDb();
    await syncItem(db, "u1", item({ status: "reauth_required" }));
    const flag = calls.itemUpdate.at(-1);
    expect(flag.status_changed_at).toBeUndefined();
  });
});

describe("syncAllItems — ledger rebuild on new activity", () => {
  it("rebuilds the ledger when new transactions landed", async () => {
    const plaid = await import("@/lib/plaid");
    (plaid.selectPlaidItems as any).mockResolvedValueOnce({ rows: [item()], error: null });
    transactionsSync.mockResolvedValueOnce({ data: { added: [txn("a1")], modified: [], removed: [], next_cursor: "c1", has_more: false } });
    const { db } = fakeDb();
    await syncAllItems(db, "u1");
    expect(buildAndPersistForUser).toHaveBeenCalledTimes(1);
  });

  it("does NOT rebuild when nothing changed", async () => {
    const plaid = await import("@/lib/plaid");
    (plaid.selectPlaidItems as any).mockResolvedValueOnce({ rows: [item()], error: null });
    transactionsSync.mockResolvedValueOnce({ data: { added: [], modified: [], removed: [], next_cursor: "c1", has_more: false } });
    const { db } = fakeDb();
    await syncAllItems(db, "u1");
    expect(buildAndPersistForUser).not.toHaveBeenCalled();
  });
});

function txn(id: string) {
  return {
    transaction_id: id, account_id: "acc", date: "2026-07-15", name: id, merchant_name: null,
    amount: 12.5, iso_currency_code: "USD", personal_finance_category: null, category: null, pending: false,
  };
}
