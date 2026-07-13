import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { logError } from "@/lib/error-log";
import { parseBody } from "@/lib/validate";
import { z } from "zod";

export const dynamic = "force-dynamic";

// SMOOTH S5 — nav-timing beacon. The client posts { route, ms } = time from
// navigation intent (click) to first contentful data render. We record it in the
// existing error_log channel as a low-noise info row (section "perf") so the admin
// dashboard can compute p50/p95 per route without a new table. Sampled client-side
// (see lib/nav-timing) so this isn't hit on every navigation.
const Body = z.object({
  route: z.string().min(1).max(120),
  ms: z.number().finite().nonnegative().max(120_000),
  cached: z.boolean().optional(),   // true if the destination rendered from cache
});

export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  // Attribute to the user when we can, but don't hard-fail an anonymous beacon.
  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;
  const { route, ms, cached } = parsed.data;

  await logError({
    message: `nav ${route} ${Math.round(ms)}ms${cached ? " (cache)" : ""}`,
    section: "perf",
    category: "app",
    severity: "info",
    path: route,
    userId: ctx?.userId ?? null,
    meta: { kind: "nav-timing", route, ms: Math.round(ms), cached: Boolean(cached) },
  });

  return NextResponse.json({ ok: true });
}
