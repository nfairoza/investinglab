import { resolveApiKey } from "./anthropic";
import {
  callGemini, geminiKey, geminiProModel, geminiFlashModel,
} from "./gemini";
import { getRuntimeStrategy } from "./runtime-key";

// =============================================================================
// Task-aware AI router.
//
// Routes each job to the model best suited for it, then falls back to the other
// provider on failure. The user-approved policy:
//   - Deep analysis (predictions, Portfolio Doctor, research memo, congress
//     thesis) -> Opus 4.8 leads (best step-by-step financial reasoning),
//     Gemini Pro fallback.
//   - Big-context / structured-JSON / casual chat -> Gemini leads (huge context,
//     reliable JSON, cheaper), Claude fallback.
//   - Navigation/teaching chat -> cheapest capable model.
//
// A "strategy" knob overrides the lean:
//   - smart (default): the policy above (accuracy where it matters, cheap else).
//   - quality: always the most capable model for every task.
//   - economy: prefer cheap models; only escalate the heaviest analysis.
// =============================================================================

export type AiTask =
  | "deep-analysis"   // predictions, portfolio doctor, research memo
  | "structured"      // big-context / strict-JSON extraction
  | "chat-analysis"   // chat turn that needs real reasoning over data
  | "chat-casual"     // navigation, teaching, small talk
  | "light";          // cheap quick generation (suggestions, short lists, labels)

export type Strategy = "smart" | "quality" | "economy";
export type Provider = "claude" | "gemini";

export function resolveStrategy(): Strategy {
  const s = (getRuntimeStrategy() || process.env.AI_STRATEGY || "smart").toLowerCase();
  return s === "quality" || s === "economy" ? s : "smart";
}

// Anthropic model tiers (ids verified in settings-ai).
const CLAUDE_OPUS = "claude-opus-4-8";
const CLAUDE_SONNET = "claude-sonnet-4-6";
const CLAUDE_HAIKU = "claude-haiku-4-5-20251001";

export interface RoutePlan {
  primary: Provider;
  claudeModel: string;  // model to use if Claude runs
  geminiModel: string;  // model to use if Gemini runs
  reason: string;
}

// Decide who leads + which model each provider would use, for a task+strategy.
export function planRoute(task: AiTask, strategy: Strategy = resolveStrategy()): RoutePlan {
  const opus = { claudeModel: CLAUDE_OPUS, geminiModel: geminiProModel() };
  const pro = { claudeModel: CLAUDE_SONNET, geminiModel: geminiProModel() };
  const cheap = { claudeModel: CLAUDE_HAIKU, geminiModel: geminiFlashModel() };

  if (strategy === "quality") {
    // Best model everywhere; analysis still leans Claude-Opus, bulk leans Gemini-Pro.
    // Even here, trivially light jobs stay on the cheap/fast model — paying Opus
    // to emit a 5-item suggestion list is pure waste.
    if (task === "light")
      return { primary: "gemini", ...cheap, reason: "Quality: light task stays cheap (no reasoning needed)." };
    if (task === "deep-analysis" || task === "chat-analysis")
      return { primary: "claude", ...opus, reason: "Quality: Opus 4.8 for maximum reasoning." };
    return { primary: "gemini", ...opus, reason: "Quality: Gemini Pro for big-context/structured." };
  }

  if (strategy === "economy") {
    // Cheap by default; only the heaviest analysis escalates to Opus.
    if (task === "deep-analysis")
      return { primary: "claude", ...opus, reason: "Economy: escalate only deep analysis to Opus." };
    if (task === "structured")
      return { primary: "gemini", claudeModel: CLAUDE_HAIKU, geminiModel: geminiProModel(), reason: "Economy: Gemini Pro for reliable JSON." };
    return { primary: "gemini", ...cheap, reason: "Economy: cheapest capable model for chat/light." };
  }

  // smart (default) — the approved policy.
  switch (task) {
    case "deep-analysis":
      return { primary: "claude", ...opus, reason: "Smart: Opus 4.8 leads deep financial reasoning; Gemini Pro fallback." };
    case "structured":
      return { primary: "gemini", claudeModel: CLAUDE_SONNET, geminiModel: geminiProModel(), reason: "Smart: Gemini Pro for huge context + reliable JSON; Claude fallback." };
    case "chat-analysis":
      return { primary: "claude", ...pro, reason: "Smart: Sonnet for solid reasoning on data-backed chat; Gemini fallback." };
    case "light":
      return { primary: "gemini", ...cheap, reason: "Smart: cheap/fast model for short suggestions/labels — no deep reasoning." };
    case "chat-casual":
    default:
      return { primary: "gemini", ...cheap, reason: "Smart: cheap/fast model for navigation & teaching; escalate if needed." };
  }
}

function isNetErr(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /Network error reaching|timeout|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|fetch failed|UNABLE_TO_GET|network/i.test(m);
}

export interface RouteResult {
  text: string;
  provider: Provider;
  model: string;
  plan: RoutePlan;
}

// Run a non-streaming text job through the router with cross-provider fallback.
// `webSearch` enables Claude web_search / Gemini grounding where supported.
export async function routeText(opts: {
  task: AiTask;
  system: string;
  user: string;
  maxTokens?: number;
  webSearch?: boolean;
  strategy?: Strategy;
}): Promise<RouteResult> {
  const plan = planRoute(opts.task, opts.strategy ?? resolveStrategy());
  const haveClaude = Boolean(resolveApiKey());
  const haveGemini = Boolean(geminiKey());
  if (!haveClaude && !haveGemini) throw new Error("No AI provider configured (no Claude or Gemini key).");

  // Order providers: planned primary first, then the other as fallback —
  // but skip any provider whose key is missing.
  const order: Provider[] = plan.primary === "claude" ? ["claude", "gemini"] : ["gemini", "claude"];
  const enabled = order.filter((p) => (p === "claude" ? haveClaude : haveGemini));

  let lastErr: unknown;
  for (let i = 0; i < enabled.length; i++) {
    const provider = enabled[i];
    const isLast = i === enabled.length - 1;
    try {
      if (provider === "claude") {
        const text = await callClaudeModel({ system: opts.system, user: opts.user, model: plan.claudeModel, maxTokens: opts.maxTokens, webSearch: opts.webSearch });
        return { text, provider: "claude", model: plan.claudeModel, plan };
      } else {
        const text = await callGemini({ system: opts.system, user: opts.user, webSearch: opts.webSearch, model: plan.geminiModel });
        return { text, provider: "gemini", model: plan.geminiModel, plan };
      }
    } catch (e) {
      lastErr = e;
      // Only fall through to the other provider on a network/connectivity error
      // (an auth/4xx error would just fail again and waste a call). On the last
      // option, rethrow regardless.
      if (isLast) throw e;
      if (!isNetErr(e)) {
        // Non-network error (e.g. bad request) — still try the other provider once,
        // since a model-specific failure can succeed elsewhere.
        continue;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("All AI providers failed.");
}

// Claude call honoring a specific model + optional web_search tool. Mirrors
// callClaude() in anthropic.ts but lets the router pick the model per task.
async function callClaudeModel(opts: {
  system: string; user: string; model: string; maxTokens?: number; webSearch?: boolean;
}): Promise<string> {
  const key = resolveApiKey();
  if (!key) throw new Error("No Claude key");
  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens ?? 4096,
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
        ...(opts.webSearch ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }] } : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(40_000),
    });
  } catch (e: any) {
    const cause = e?.cause?.message || e?.cause?.code || e?.message || "unknown";
    throw new Error(`Network error reaching api.anthropic.com: ${cause}`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Anthropic HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return (json.content ?? []).filter((b) => b.type === "text" && b.text).map((b) => b.text as string).join("\n");
}

// Human-readable strategy label for the UI.
export function strategyLabel(s: Strategy): string {
  return s === "quality" ? "Quality (always best)" : s === "economy" ? "Economy (cost-saving)" : "Smart (auto)";
}
