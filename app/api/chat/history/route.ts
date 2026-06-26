import { NextRequest, NextResponse } from "next/server";
import { getUserClient, readAiCache, writeAiCache } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// Per-user chat continuity across devices (phone ↔ web). Stored in the existing
// user_prefs.ai_cache under "chat_history" — no new table. The conversation is
// kept only while ACTIVE: if the last activity was over 1 hour ago, it's treated
// as a new session and not returned (the client also clears it).
const KEY = "chat_history";
const TTL_MS = 60 * 60 * 1000; // 1 hour idle → reset

// GET — return the saved messages if the session is still fresh (<1h idle).
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ messages: [] });
  const entry = await readAiCache(ctx, KEY);
  if (!entry?.generatedAt) return NextResponse.json({ messages: [] });
  const age = Date.now() - new Date(entry.generatedAt).getTime();
  if (age > TTL_MS) return NextResponse.json({ messages: [], expired: true });
  const data = entry.data as { messages?: unknown[] } | undefined;
  return NextResponse.json({ messages: Array.isArray(data?.messages) ? data!.messages : [] });
}

// PUT { messages } — save the current conversation, stamping "now" as the last
// activity (which slides the 1-hour idle window forward).
export async function PUT(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const messages = Array.isArray(body?.messages) ? body.messages.slice(-40) : [];
  await writeAiCache(ctx, KEY, { generatedAt: new Date().toISOString(), data: { messages } });
  return NextResponse.json({ ok: true });
}

// DELETE — clear the saved conversation (the "Clear chat" button).
export async function DELETE() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await writeAiCache(ctx, KEY, { generatedAt: new Date().toISOString(), data: { messages: [] } });
  return NextResponse.json({ ok: true });
}
