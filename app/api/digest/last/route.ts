import { NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { readServerCache } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

// GET /api/digest/last — the user's most recently rendered digest HTML (F2
// "View last digest"). Stored by the digest run in server_cache.
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { value } = await readServerCache<{ html: string; at: string }>(`digest:last:${ctx.userId}`, Number.MAX_SAFE_INTEGER).catch(() => ({ value: null } as any));
  if (!value) return NextResponse.json({ html: null });
  return NextResponse.json({ html: value.html, at: value.at });
}
