import { describe, it, expect } from "vitest";
import { detectClusters, type InsiderBuy } from "@/lib/power-trades/clusters";

function buy(issuer: string, insider: string, date: string, value = 100_000, tradeId = `${issuer}-${insider}-${date}`): InsiderBuy {
  return { issuer, insider, date, value, tradeId };
}

describe("detectClusters", () => {
  it("flags 3 distinct insiders buying the same issuer within 30 days", () => {
    const clusters = detectClusters([
      buy("CAT", "Alice", "2026-06-01", 1_000_000),
      buy("CAT", "Bob", "2026-06-10", 700_000),
      buy("CAT", "Carol", "2026-06-20", 400_000),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].issuer).toBe("CAT");
    expect(clusters[0].insiderCount).toBe(3);
    expect(clusters[0].totalValue).toBe(2_100_000);
    expect(clusters[0].tradeIds).toHaveLength(3);
  });

  it("does NOT flag only 2 distinct insiders", () => {
    expect(detectClusters([
      buy("CAT", "Alice", "2026-06-01"),
      buy("CAT", "Bob", "2026-06-10"),
    ])).toHaveLength(0);
  });

  it("does NOT count the SAME insider three times", () => {
    expect(detectClusters([
      buy("CAT", "Alice", "2026-06-01"),
      buy("CAT", "Alice", "2026-06-08"),
      buy("CAT", "Alice", "2026-06-15"),
    ])).toHaveLength(0);
  });

  it("does NOT flag 3 insiders spread beyond 30 days", () => {
    expect(detectClusters([
      buy("CAT", "Alice", "2026-06-01"),
      buy("CAT", "Bob", "2026-06-20"),
      buy("CAT", "Carol", "2026-08-01"), // >30d after Alice AND after Bob
    ])).toHaveLength(0);
  });

  it("separates clusters per issuer", () => {
    const clusters = detectClusters([
      buy("CAT", "Alice", "2026-06-01"), buy("CAT", "Bob", "2026-06-05"), buy("CAT", "Carol", "2026-06-09"),
      buy("DE", "Dan", "2026-06-02"), buy("DE", "Erin", "2026-06-06"), buy("DE", "Frank", "2026-06-10"),
    ]);
    expect(clusters).toHaveLength(2);
    expect(new Set(clusters.map((c) => c.issuer))).toEqual(new Set(["CAT", "DE"]));
  });

  it("sorts most-insiders first", () => {
    const clusters = detectClusters([
      buy("CAT", "A", "2026-06-01"), buy("CAT", "B", "2026-06-03"), buy("CAT", "C", "2026-06-05"),
      buy("DE", "D", "2026-06-01"), buy("DE", "E", "2026-06-03"), buy("DE", "F", "2026-06-05"), buy("DE", "G", "2026-06-07"),
    ]);
    expect(clusters[0].issuer).toBe("DE");
    expect(clusters[0].insiderCount).toBe(4);
  });
});
