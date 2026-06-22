import { NextRequest, NextResponse } from "next/server";
import { CONNECTORS } from "@/lib/connectors/registry";
import { setConnectorValues, runtimeHas } from "@/lib/connectors/runtime";
import { getAdminClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// Connectors with their own dedicated card (not in the generic registry) but
// that still store credentials through the shared runtime store.
const EXTRA: Record<string, { fields: string[]; envVars: string[] }> = {
  etrade: {
    fields: ["ETRADE_CONSUMER_KEY", "ETRADE_CONSUMER_SECRET"],
    envVars: ["ETRADE_CONSUMER_KEY", "ETRADE_CONSUMER_SECRET"],
  },
  robinhood_crypto: {
    fields: ["ROBINHOOD_CRYPTO_API_KEY", "ROBINHOOD_CRYPTO_PRIVATE_KEY"],
    envVars: ["ROBINHOOD_CRYPTO_API_KEY", "ROBINHOOD_CRYPTO_PRIVATE_KEY"],
  },
};

// POST { connectorId, values: { FIELD: value } }  -> set runtime values
// POST { connectorId, clear: true }                -> clear that connector
export async function POST(req: NextRequest) {
  // Platform API keys are admin-only. Regular users can't view or edit them.
  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: "forbidden", message: "Admin only." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const registry = CONNECTORS.find((c) => c.id === body?.connectorId);
  const fieldIds = registry ? registry.fields.map((f) => f.id) : EXTRA[body?.connectorId]?.fields;
  const envVars = registry ? registry.envVars : EXTRA[body?.connectorId]?.envVars;
  if (!fieldIds || !envVars) return NextResponse.json({ error: "unknown connector" }, { status: 400 });

  if (body?.clear) {
    setConnectorValues(Object.fromEntries(fieldIds.map((f) => [f, null])));
  } else {
    const values = (body?.values ?? {}) as Record<string, string>;
    const allowed = Object.fromEntries(
      fieldIds.filter((f) => typeof values[f] === "string").map((f) => [f, values[f]]),
    );
    setConnectorValues(allowed);
  }

  const hasRuntime = fieldIds.some((f) => runtimeHas(f));
  const hasEnv = envVars.some((e) => Boolean(process.env[e]));
  return NextResponse.json({
    id: body?.connectorId,
    configured: hasRuntime || hasEnv,
    source: hasRuntime ? "runtime" : hasEnv ? "env" : "none",
  });
}
