import { describe, it, expect } from "vitest";
import { decideEnrich } from "@/lib/watchlist/enrich-policy";

// ENRICH3 — users consume AI output; only admins (or staleness) trigger generation.
describe("decideEnrich — force is admin-only", () => {
  it("non-admin force → forbidden (403 path)", () => {
    expect(decideEnrich(true, false)).toEqual({ kind: "forbidden" });
  });

  it("admin force → regenerate unconditionally", () => {
    expect(decideEnrich(true, true)).toEqual({ kind: "force" });
  });

  it("non-admin non-force → auto (server regenerates only if cache stale)", () => {
    expect(decideEnrich(false, false)).toEqual({ kind: "auto" });
  });

  it("admin non-force → auto (admin viewing normally isn't a force)", () => {
    expect(decideEnrich(false, true)).toEqual({ kind: "auto" });
  });

  it("THE GUARANTEE: a regular user can never reach the force/generation path by hand", () => {
    // Whatever a non-admin sends, they get either 'forbidden' (if they set force)
    // or 'auto' (which only regenerates on genuine staleness) — never 'force'.
    expect(decideEnrich(true, false).kind).not.toBe("force");
    expect(decideEnrich(false, false).kind).not.toBe("force");
  });
});
