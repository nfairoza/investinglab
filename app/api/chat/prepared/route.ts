import { NextRequest, NextResponse } from "next/server";
import { getUserClient, readAiCache, writeAiCache } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// Cache for "pre-prepared" chat questions (the ✦ Ask-Rukmani buttons on the
// money-insight cards). These ask the SAME deterministic question repeatedly, and
// Rukmani is slow, so we cache the answer per-user keyed by the prompt text.
// Stored in user_prefs.ai_cache under "chat_prepared" as a { [hash]: {a, at} } map.
// TTL 24h — money insights refresh roughly daily, so a day-old answer is fine.
const KEY = "chat_prepared";
const TTL_MS = 24 * 60 * 60 * 1000;

// Tiny stable hash of the prompt (djb2) so we don't store full prompt text as keys.
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// GET ?prompt=… → { answer } if a fresh cached answer exists, else { answer: null }.
export async function GET(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ answer: null });
  const prompt = req.nextUrl.searchParams.get("prompt") ?? "";
  if (!prompt) return NextResponse.json({ answer: null });
  const entry = await readAiCache(ctx, KEY);
  const map = (entry?.data as Record<string, { a: string; at: number }> | undefined) ?? {};
  const hit = map[hash(prompt)];
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json({ answer: hit.a, cached: true });
  return NextResponse.json({ answer: null });
}

// POST { prompt, answer } → store the answer for this prompt. Keeps the map small
// (latest 50 prepared answers).
export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const prompt = typeof body?.prompt === "string" ? body.prompt : "";
  const answer = typeof body?.answer === "string" ? body.answer : "";
  if (!prompt || !answer) return NextResponse.json({ ok: false });
  const entry = await readAiCache(ctx, KEY);
  const map = (entry?.data as Record<string, { a: string; at: number }> | undefined) ?? {};
  map[hash(prompt)] = { a: answer, at: Date.now() };
  // Cap the map at 50 most-recent entries.
  const keys = Object.keys(map);
  if (keys.length > 50) {
    keys.sort((x, y) => map[x].at - map[y].at).slice(0, keys.length - 50).forEach((k) => delete map[k]);
  }
  await writeAiCache(ctx, KEY, { generatedAt: new Date().toISOString(), data: map });
  return NextResponse.json({ ok: true });
}
