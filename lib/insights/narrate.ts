import type { StoredInsight, StructuredInsight } from "./types";
import { routeText } from "@/lib/ai/router";

// =============================================================================
// Narration (Layer 4). The LLM writes ONLY the connective prose; every number is
// injected by the renderer from headlineSlots. To make the "LLM never computes"
// law enforceable rather than aspirational, assertNoNumerals REJECTS any model
// output containing a digit — a poisoned response falls back to a plain template.
//
// Tone (C3): warm, never scolding; "worth a look", not "stop doing X". Severity-3
// (money stress) uses the gentlest register and always pairs the fact with one
// small next step. This is baked into the system prompt AND the fallbacks.
// =============================================================================

// True if the string contains NO digit. Numbers must come from slots, never the
// model. (Currency words like "thousand" are fine; literal figures are not.)
export function assertNoNumerals(text: string): boolean {
  return !/[0-9]/.test(text);
}

// Deterministic, number-free templates per kind. These ALWAYS pass the validator
// (they contain no digits) and are the fallback when the LLM misbehaves or is
// unavailable — the product never blocks on the AI.
export function templateFor(kind: string): { headline: string; body: string } {
  switch (kind) {
    case "pace_anomaly":
      return { headline: "Spending is running high in {category}", body: "You're on track to spend about {projected} on {category} this month — roughly {overPct}% above your usual {baseline}. Worth a look if it wasn't planned." };
    case "debt_vs_cash":
      return { headline: "Idle cash could knock down your {card} balance", body: "You have {idle} sitting beyond your buffer while {card} charges {apr}%. Moving {payable} to it would save about {guaranteedAnnual} a year, guaranteed." };
    case "interest_bleed":
      return { headline: "Card interest is adding up", body: "At current balances your cards are on pace to cost about {projectedAnnual} in interest this year, at a blended {weightedApr}%. Even a partial paydown trims it." };
    case "positive_spend_down":
      return { headline: "Nice — {category} is down", body: "You've spent about {saved} less on {category} than usual — down {downPct}%. Keep it up and that's roughly {saved} back in your pocket each month." };
    case "positive_networth":
      return { headline: "Your net worth is climbing", body: "You've grown from {start} to {end} lately — about {monthlySlope} a month. Steady progress." };
    case "concentration":
      return { headline: "{symbol} is a big slice of your portfolio", body: "{symbol} is about {pct}% of your holdings. Nothing wrong with conviction — just worth a look so one name doesn't carry your whole outcome." };
    case "idle_cash":
      return { headline: "You have cash sitting idle", body: "About {idle} is beyond your safety buffer. Some people keep spare cash in a high-yield savings account or short-term treasuries — options worth comparing, your call." };
    case "utilization":
      return { headline: "Your credit utilization is climbing", body: "You're using about {totalUtil}% of your available credit. Keeping it lower can help your credit profile — worth a look, especially on {worstCard}." };
    case "low_buffer":
      return { headline: "Your cash cushion is running thin", body: "You have under a month of expenses in easy-to-reach cash right now. No alarm — a small, steady auto-transfer to savings is a gentle way to rebuild it when you can." };
    case "savings_capacity":
      return { headline: "You have room to save more", body: "You typically have about {capacity} unspent each month. Automating a transfer that day could quietly grow your savings — only if it feels comfortable." };
    case "category_trend":
      return { headline: "{category} has crept up", body: "Your {category} spending is running about {upPct}% above your usual — roughly {delta} more. Worth a look if it wasn't planned." };
    case "recurring_new":
      return { headline: "New recurring charge spotted", body: "{merchant} looks like a new recurring charge, about {amount} a {cadence}. Worth a glance to make sure it's one you meant to keep." };
    case "recurring_increase":
      return { headline: "A subscription went up", body: "{merchant} went from about {prev} to {last}. Price creep is easy to miss — worth a look if you didn't expect it." };
    case "closure":
      return { headline: "You followed through on {category}", body: "Since we flagged it, your {category} spending is down about {downPct}% — roughly {savedMonthly} a month, or {capturedYear} a year at this pace. Nicely done." };
    default:
      return { headline: "A money note for you", body: "There's something worth a look in your accounts." };
  }
}

// Fill {slot} placeholders with the insight's numbers (formatted). This is the
// ONLY place numbers enter the copy.
export function fillSlots(template: string, slots: Record<string, number | string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const v = slots[key];
    if (v == null) return "";
    if (typeof v === "number") {
      // Currency-ish default: money slots read as $. Percent slots end in "Pct".
      if (/pct$/i.test(key)) return `${v}`;
      return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
    }
    return String(v);
  });
}

const SYSTEM = [
  "You are Rukmani, a warm, calm personal-finance confidant.",
  "You will be given a short template with {placeholders}. Rewrite ONLY the prose to sound warm and human.",
  "ABSOLUTE RULES:",
  "- Never write any digit or number. Keep every {placeholder} EXACTLY as-is; the app fills them in.",
  "- Never scold. Say 'worth a look', never 'stop'. For money stress, be gentle and offer one small step.",
  "- Keep it to one or two short sentences. No emojis, no markdown.",
].join("\n");

// Narrate one insight. Returns headline+body with slots still as placeholders,
// so the caller fills them AFTER validation (the model never sees the numbers).
export async function narrate(insight: StructuredInsight | StoredInsight): Promise<{ headline: string; body: string }> {
  const tmpl = templateFor(insight.kind);
  try {
    const res = await routeText({
      task: "light",
      feature: "insights-narration",
      system: SYSTEM,
      user: `Template headline: ${tmpl.headline}\nTemplate body: ${tmpl.body}\nRewrite both, keeping every {placeholder}. Reply as: HEADLINE: ...\\nBODY: ...`,
      maxTokens: 200,
    });
    const headline = res.text.match(/HEADLINE:\s*(.+)/i)?.[1]?.trim() ?? "";
    const body = res.text.match(/BODY:\s*([\s\S]+)/i)?.[1]?.trim() ?? "";
    // Validate: no digits AND placeholders preserved; else fall back to template.
    if (headline && body && assertNoNumerals(headline) && assertNoNumerals(body)) {
      return { headline, body };
    }
  } catch { /* fall through to template */ }
  return tmpl;
}
