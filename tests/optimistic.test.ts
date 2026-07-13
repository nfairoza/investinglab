import { describe, it, expect, vi, beforeEach } from "vitest";

// SMOOTH S4 — verify the optimistic-mutation helper: on a server failure it rolls
// back (SWR's rollbackOnError, which surfaces as a rejected mutate) and fires the
// error toast; on success it does NOT toast. We mock `swr` and `lib/toast` so the
// test is pure (no network, no React).

const toastErrorSpy = vi.fn();
vi.mock("@/lib/toast", () => ({
  toast: vi.fn(),
  toastError: (m: string) => toastErrorSpy(m),
}));

// Fake SWR mutate: runs the updater fn; if it throws, reject (as rollbackOnError
// does after restoring the cache). Also record the optimisticData updater so we
// can assert the optimistic shape.
let lastOptions: any = null;
const mutateSpy = vi.fn(async (_key: unknown, fn: () => Promise<unknown>, options: any) => {
  lastOptions = options;
  try {
    return await fn();
  } catch (e) {
    // SWR rolls back internally, then the mutate promise rejects.
    throw e;
  }
});
vi.mock("swr", () => ({ mutate: (...args: any[]) => (mutateSpy as any)(...args) }));

// Import AFTER the mocks are registered.
const { optimisticUpdate } = await import("@/lib/optimistic");

describe("optimisticUpdate", () => {
  beforeEach(() => { toastErrorSpy.mockClear(); mutateSpy.mockClear(); lastOptions = null; });

  it("applies the optimistic updater and does NOT toast on success", async () => {
    await optimisticUpdate<{ items: number[] }>({
      key: "/api/x",
      current: { items: [1, 2] },
      optimistic: (cur) => ({ items: [...(cur?.items ?? []), 3] }),
      request: async () => { /* 200 OK */ },
      errorMessage: "nope",
    });
    // The optimistic updater was handed to SWR and produces the expected shape.
    expect(lastOptions.optimisticData({ items: [1, 2] })).toEqual({ items: [1, 2, 3] });
    expect(lastOptions.rollbackOnError).toBe(true);
    expect(toastErrorSpy).not.toHaveBeenCalled();
  });

  it("ACCEPTANCE: server 500 → rolls back and shows the error toast", async () => {
    await optimisticUpdate({
      key: "/api/follows",
      current: undefined,
      optimistic: (cur: any) => cur,
      request: async () => { throw new Error("follow 500"); }, // simulated 500
      errorMessage: "Couldn't follow — try again.",
    });
    expect(mutateSpy).toHaveBeenCalled();
    expect(lastOptions.rollbackOnError).toBe(true);           // SWR restores prior cache
    expect(toastErrorSpy).toHaveBeenCalledWith("Couldn't follow — try again.");
  });

  it("does not trust the request return value (populateCache:false, revalidates)", async () => {
    await optimisticUpdate({
      key: "/api/x", current: undefined,
      optimistic: (c: any) => c, request: async () => ({ sneaky: "payload" }), errorMessage: "x",
    });
    expect(lastOptions.populateCache).toBe(false);
    expect(lastOptions.revalidate).toBe(true);
  });
});
