import { NextResponse } from "next/server";
import { callClaude, resolveModel } from "@/lib/ai/anthropic";

export const dynamic = "force-dynamic";

// Tiny round-trip to confirm the configured key actually works.
export async function POST() {
  try {
    const text = await callClaude({
      system: "Reply with exactly the word: ok",
      user: "ping",
      maxTokens: 8,
    });
    return NextResponse.json({ ok: true, model: resolveModel(), reply: text.trim().slice(0, 40) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "test failed" },
      { status: 200 },
    );
  }
}
