import { describe, it, expect } from "vitest";
import { classifyIntent } from "@/lib/ai/intent";

// A1 acceptance: heuristics route obvious cases with zero classifier tokens.
describe("classifyIntent — casual", () => {
  const casual = [
    "when does the market open?",
    "when do markets close today?",
    "hi",
    "thanks!",
    "what does P/E mean?",
    "explain what a dividend is",
    "how do I find my watchlist?",
    "where is the settings page",
    "what can you do?",
    "are markets open on holidays?",
    "is it premarket right now",
  ];
  for (const msg of casual) {
    it(`"${msg}" → casual`, () => {
      const r = classifyIntent(msg);
      expect(r.intent).toBe("chat-casual");
      expect(r.confident).toBe(true);
    });
  }
});

describe("classifyIntent — analysis", () => {
  const analysis = [
    "analyze my portfolio risk",
    "should I sell NVDA?",
    "why did AMD drop today?",
    "compare AAPL vs MSFT",
    "is my portfolio too concentrated?",
    "how much did I spend on dining last month?",
    "am I overexposed to tech?",
    "what's my net worth trend?",
    "is TSLA overvalued?",
    "how's my spending this month",
  ];
  for (const msg of analysis) {
    it(`"${msg}" → analysis`, () => {
      expect(classifyIntent(msg).intent).toBe("chat-analysis");
    });
  }
});

describe("classifyIntent — ambiguous", () => {
  it("a bare ticker leans analysis but low-confidence", () => {
    const r = classifyIntent("NVDA");
    expect(r.intent).toBe("chat-analysis");
    expect(r.confident).toBe(false);
  });
  it("empty → casual", () => {
    expect(classifyIntent("").intent).toBe("chat-casual");
  });
  it("the canonical case routes casual with zero classifier tokens", () => {
    const r = classifyIntent("when does market open");
    expect(r.intent).toBe("chat-casual");
    expect(r.confident).toBe(true);
  });
});
