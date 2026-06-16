import { getRuntimeKey, getRuntimeModel } from "./runtime-key";

// The research engine uses Anthropic's Claude. Key resolution order:
//   1. a key entered in Settings (runtime, dev only)
//   2. ANTHROPIC_API_KEY (preferred for deployment)
//   3. AI_API_KEY (generic fallback name from the spec)
// Model resolution: Settings -> AI_MODEL env -> DEFAULT_MODEL.

export const DEFAULT_MODEL = "claude-sonnet-4-6";

export function resolveApiKey(): string | null {
  return (
    getRuntimeKey() ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.AI_API_KEY ||
    null
  );
}

export function resolveModel(): string {
  return getRuntimeModel() || process.env.AI_MODEL || DEFAULT_MODEL;
}

export type AiSource = "runtime" | "env" | "none";

export function aiStatus(): { configured: boolean; source: AiSource; model: string } {
  if (getRuntimeKey()) return { configured: true, source: "runtime", model: resolveModel() };
  if (process.env.ANTHROPIC_API_KEY || process.env.AI_API_KEY) {
    return { configured: true, source: "env", model: resolveModel() };
  }
  return { configured: false, source: "none", model: resolveModel() };
}

// Calls the Anthropic Messages API and returns the concatenated text output.
// Throws on missing key or a non-OK response so callers can degrade to
// "unavailable" rather than inventing analysis.
export async function callClaude(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const key = resolveApiKey();
  if (!key) throw new Error("No AI key configured");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: resolveModel(),
      max_tokens: opts.maxTokens ?? 4096,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Anthropic HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }

  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return (json.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n");
}
