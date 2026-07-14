// =============================================================================
// AIOPT A1 — per-message chat intent classification.
//
// Chat must not route every turn to the expensive analysis tier. This pure,
// heuristic-first classifier decides whether a message needs real reasoning over
// the user's data (chat-analysis → Claude) or is casual navigation/teaching/
// small-talk ("when does the market open") that a cheap/fast model handles
// perfectly (chat-casual → Flash/Haiku). Only genuinely ambiguous messages need
// a tiny classifier model call — handled by the caller, not here.
// =============================================================================

export type ChatIntent = "chat-casual" | "chat-analysis";

export interface IntentResult {
  intent: ChatIntent;
  confident: boolean; // false → caller may run a micro-classifier to disambiguate
  reason: string;
}

// Vocabulary that strongly implies the model must reason over the user's data or
// call a tool: holdings/money verbs, comparison/causation, portfolio nouns.
const ANALYSIS_RE = new RegExp(
  [
    "\\banaly[sz]", "\\bshould i\\b", "\\bwhy (did|is|are|has)\\b", "\\bcompare\\b", "\\bvs\\b",
    "\\brisk", "\\ballocat", "\\bdiversif", "\\brebalanc", "\\bconcentrat", "\\bexposure\\b",
    "\\bmy (portfolio|holdings|position|account|net worth|spending|budget|cash|goal)",
    "\\bhow much (did|do|have) i\\b", "\\bam i (over|under)", "\\bhow('?s| is) my\\b",
    "\\bprediction\\b", "\\bforecast\\b", "\\bworth (buying|selling|holding)\\b",
    "\\bundervalued\\b", "\\bovervalued\\b", "\\bearnings\\b", "\\bdividend", "\\bvaluation\\b",
    "\\btransaction", "\\bspent\\b", "\\bspending\\b", "\\brecurring\\b", "\\bsubscription",
  ].join("|"),
  "i",
);

// Clear casual/navigation/teaching intents — no data, no tool likely needed.
const CASUAL_RE = new RegExp(
  [
    "^\\s*(hi|hey|hello|yo|sup|thanks|thank you|ok|okay|cool|nice|got it|great)\\b",
    "\\bwhen (does|do|is|are)\\b.*\\b(market|markets|open|close|nyse|nasdaq)\\b",
    "\\bwhat (is|are|does)\\b.*\\b(mean|meaning|stand for)\\b", // glossary-style
    "\\bwhat('?s| is) (a|an|the)\\b", "\\bhow do i\\b.*\\b(use|find|navigate|get to|see|open)\\b",
    "\\bwhere (is|do i|can i)\\b", "\\bexplain\\b", "\\bwhat can you do\\b", "\\bhelp\\b",
    "\\bmarket hours\\b", "\\bholiday", "\\bpremarket\\b", "\\bafter hours\\b",
  ].join("|"),
  "i",
);

// A ticker mention ($AAPL / AAPL) or a dollar amount hints at data-backed reasoning.
const TICKER_RE = /\$[A-Za-z]{1,5}\b|\b[A-Z]{2,5}\b/;
const MONEY_RE = /\$\s?\d|\b\d{3,}\b/;

const SHORT_WORDS = 8; // "short message" threshold

export function classifyIntent(message: string): IntentResult {
  const m = (message ?? "").trim();
  if (!m) return { intent: "chat-casual", confident: true, reason: "empty → casual" };

  const words = m.split(/\s+/).length;

  // A pure teaching/definition ask ("explain…", "what does X mean") is casual
  // even when it names a finance term — it needs no user data or tools. This
  // must beat the analysis-vocabulary check ("dividend" etc. is just the subject).
  const isDefinitional = /^\s*explain\b|\bwhat (is|are|does|do)\b.*\b(mean|meaning|stand for)\b|\bwhat('?s| is) (a|an|the)\b/i.test(m);
  if (isDefinitional && !/\bmy\b|\bshould i\b|\bwhy did\b/i.test(m)) {
    return { intent: "chat-casual", confident: true, reason: "definitional/teaching question" };
  }

  // Strong analysis signal wins outright.
  if (ANALYSIS_RE.test(m)) return { intent: "chat-analysis", confident: true, reason: "analysis vocabulary/verb" };

  // Strong casual signal (and no analysis vocab) → casual.
  if (CASUAL_RE.test(m)) return { intent: "chat-casual", confident: true, reason: "casual/navigation/teaching phrase" };

  // A short message with no ticker, no money, no analysis vocab is casual.
  const hasTicker = TICKER_RE.test(m);
  const hasMoney = MONEY_RE.test(m);
  if (words <= SHORT_WORDS && !hasTicker && !hasMoney) {
    return { intent: "chat-casual", confident: true, reason: "short, no ticker/amount/analysis vocab" };
  }

  // A ticker or amount present, but no explicit analysis verb → ambiguous. Lean
  // analysis (safer for quality) but flag low confidence so the caller MAY run a
  // cheap micro-classifier if it wants to save the escalation.
  if (hasTicker || hasMoney) {
    return { intent: "chat-analysis", confident: false, reason: "ticker/amount present, no explicit analysis verb" };
  }

  // Longer prose with no signal — default casual, low confidence.
  return { intent: "chat-casual", confident: false, reason: "no strong signal; default casual" };
}
