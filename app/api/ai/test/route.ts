import { NextResponse } from "next/server";
import { callClaude, resolveModel, resolveApiKey } from "@/lib/ai/anthropic";
import { callGemini, geminiKey, geminiModel } from "@/lib/ai/gemini";

export const dynamic = "force-dynamic";

// Round-trip test of BOTH AI providers so you can see exactly which key works.
// Each is independent: the app falls back between them, so one working provider
// is enough for AI features — but this surfaces a misconfigured/capped key.
export async function POST() {
  const claude = { configured: Boolean(resolveApiKey()), ok: false, model: resolveModel(), error: null as string | null };
  const gemini = { configured: Boolean(geminiKey()), ok: false, model: geminiModel(), error: null as string | null };

  if (claude.configured) {
    try {
      const t = await callClaude({ system: "Reply with exactly: ok", user: "ping", maxTokens: 8 });
      claude.ok = /ok/i.test(t);
    } catch (e) { claude.error = e instanceof Error ? e.message.slice(0, 200) : "failed"; }
  } else {
    claude.error = "No ANTHROPIC_API_KEY / AI_API_KEY set.";
  }

  if (gemini.configured) {
    try {
      const t = await callGemini({ system: "Reply with exactly: ok", user: "ping" });
      gemini.ok = /ok/i.test(t);
    } catch (e) { gemini.error = e instanceof Error ? e.message.slice(0, 200) : "failed"; }
  } else {
    gemini.error = "No GEMINI_API_KEY set.";
  }

  return NextResponse.json({ ok: claude.ok || gemini.ok, claude, gemini });
}
