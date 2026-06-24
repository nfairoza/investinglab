import { NextResponse } from "next/server";
import { getUserClient, getAdminClient } from "@/lib/supabase-data";
import { PRESETS } from "@/lib/screener/presets";
import { rankPresets } from "@/lib/screener/ranking";

export const dynamic = "force-dynamic";

// Public catalog shape (no imagePrompt — that's build-time only).
function catalog() {
  return PRESETS.map((p) => ({
    key: p.key, label: p.label, blurb: p.blurb, category: p.category,
    filters: p.filters, image: `/images/presets/${p.key}.jpg`,
  }));
}

// GET /api/screener/presets — authed. Returns the catalog + the day's AI order.
// rankPresets(false) auto-refreshes after the 8am ET boundary, else serves cache.
// Rationale is NOT exposed to regular users (admin-only via POST response).
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ranking = await rankPresets(false);
  return NextResponse.json({
    presets: catalog(),
    rankedKeys: ranking.rankedKeys,
    generatedAt: ranking.generatedAt,
    // Only admins see why these were chosen.
    rationale: ctx.isAdmin ? ranking.rationale : null,
    marketNote: ctx.isAdmin ? ranking.marketNote : null,
  });
}

// POST /api/screener/presets — ADMIN ONLY. Force a re-rank now (ignores cache).
export async function POST() {
  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ranking = await rankPresets(true);
  return NextResponse.json({ ok: true, ...ranking });
}
