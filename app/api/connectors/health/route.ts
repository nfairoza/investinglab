import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-data";
import { fmpHealth } from "@/lib/providers/fmp";
import { resolveApiKey } from "@/lib/ai/anthropic";
import { geminiKey } from "@/lib/ai/gemini";
import { readAllProviderHealth, isFailingOverAnHour, type ProviderHealth } from "@/lib/ai/health";

export const dynamic = "force-dynamic";

// GET /api/connectors/health — admin-only provider-health strip (P3.3 + AIOPT A6).
// Per-instance FMP call counts + durable AI provider health (last-success, error
// streak). `aiWarning` is set when a KEY-PRESENT provider has been failing >1h —
// a dead key silently rerouting all traffic is a cost incident that must show.
export async function GET() {
  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const keyPresent = { claude: Boolean(resolveApiKey()), gemini: Boolean(geminiKey()) };
  const health = await readAllProviderHealth();
  const byProvider: Record<string, ProviderHealth | undefined> = Object.fromEntries(health.map((h) => [h.provider, h]));

  // A warning fires only for a CONFIGURED provider failing >1h (an unconfigured
  // provider legitimately has no successes).
  const warnings = (["claude", "gemini"] as const)
    .filter((p) => keyPresent[p] && isFailingOverAnHour(byProvider[p] ?? null))
    .map((p) => {
      const h = byProvider[p]!;
      return { provider: p, since: h.failingSince, lastError: h.lastError, streak: h.failStreak };
    });

  return NextResponse.json({
    fmp: fmpHealth(),
    ai: { keyPresent, health, warnings, aiWarning: warnings.length > 0 },
  });
}
