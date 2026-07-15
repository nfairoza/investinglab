import { describe, it, expect } from "vitest";
import { prepareHistory, WINDOW_TURNS, type HistMessage } from "@/lib/chat/history";

const turn = (role: "user" | "assistant", content: string): HistMessage => ({ role, content });

describe("prepareHistory", () => {
  it("keeps only the last WINDOW_TURNS", () => {
    const msgs = Array.from({ length: 30 }, (_, i) => turn(i % 2 ? "assistant" : "user", `msg ${i}`));
    const out = prepareHistory(msgs, "premium");
    expect(out.length).toBeLessThanOrEqual(WINDOW_TURNS);
    // Newest message preserved.
    expect(out[out.length - 1].content).toBe("msg 29");
  });

  it("stubs a large tool-result blob in an older message", () => {
    const bigRows = JSON.stringify({ rows: Array.from({ length: 14 }, (_, i) => ({ id: i, amount: i * 10, name: "x".repeat(20) })) });
    const msgs = [
      turn("user", "show my transactions"),
      turn("assistant", `Here you go: ${bigRows}`),
      turn("user", "thanks"),
      turn("assistant", "anytime"),
    ];
    const out = prepareHistory(msgs, "premium");
    // The old assistant blob (index 1, older than last 2) is stubbed.
    const stubbed = out.find((m) => m.content.includes("[tool result:"));
    expect(stubbed).toBeTruthy();
    expect(stubbed!.content).toContain("14 rows");
  });

  it("does NOT stub the most recent messages", () => {
    const bigRows = JSON.stringify({ rows: Array.from({ length: 5 }, (_, i) => ({ id: i, blob: "y".repeat(60) })) });
    const msgs = [turn("user", "q1"), turn("assistant", `recent ${bigRows}`)];
    const out = prepareHistory(msgs, "premium");
    // Only 2 messages → within STUB_AFTER_TURNS → kept verbatim.
    expect(out[1].content).toContain(bigRows);
  });

  it("enforces the per-plan token cap by trimming oldest first", () => {
    const big = "word ".repeat(4000); // ~5k tokens each
    const msgs = [turn("user", big), turn("assistant", big), turn("user", "latest small")];
    const out = prepareHistory(msgs, "free"); // 6k cap
    // Oldest trimmed; the latest user turn is always kept.
    expect(out[out.length - 1].content).toBe("latest small");
    expect(out.length).toBeLessThan(3);
  });

  it("never drops the last remaining message even if it exceeds the cap", () => {
    const huge = "word ".repeat(10000);
    const out = prepareHistory([turn("user", huge)], "free");
    expect(out.length).toBe(1);
  });
});
