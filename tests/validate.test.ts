import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseBody, parseQuery, zSymbol } from "@/lib/validate";

// Request validation helpers (P2).
function req(body: unknown): Request {
  return new Request("http://x", { method: "POST", body: JSON.stringify(body) });
}

describe("parseBody", () => {
  it("accepts a valid body and returns typed data", async () => {
    const r = await parseBody(req({ symbol: "aapl" }), z.object({ symbol: zSymbol }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.symbol).toBe("AAPL"); // zSymbol uppercases
  });

  it("rejects an invalid body with a 400", async () => {
    const r = await parseBody(req({ symbol: "" }), z.object({ symbol: zSymbol }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(400);
  });

  it("treats malformed JSON as an empty object (then schema decides)", async () => {
    const bad = new Request("http://x", { method: "POST", body: "{not json" });
    const r = await parseBody(bad, z.object({ symbol: zSymbol }));
    expect(r.ok).toBe(false);
  });
});

describe("parseQuery", () => {
  it("parses query params against a schema", () => {
    const url = new URL("http://x/api?symbols=AAPL,MSFT");
    const r = parseQuery(url, z.object({ symbols: z.string().min(1) }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.symbols).toBe("AAPL,MSFT");
  });
});
