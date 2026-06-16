import { NextRequest, NextResponse } from "next/server";
import { CONNECTORS } from "@/lib/connectors/registry";
import { setConnectorValues, runtimeHas } from "@/lib/connectors/runtime";

export const dynamic = "force-dynamic";

// POST { connectorId, values: { FIELD: value } }  -> set runtime values
// POST { connectorId, clear: true }                -> clear that connector
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const connector = CONNECTORS.find((c) => c.id === body?.connectorId);
  if (!connector) return NextResponse.json({ error: "unknown connector" }, { status: 400 });

  if (body?.clear) {
    setConnectorValues(Object.fromEntries(connector.fields.map((f) => [f.id, null])));
  } else {
    const values = (body?.values ?? {}) as Record<string, string>;
    // only accept fields that belong to this connector
    const allowed = Object.fromEntries(
      connector.fields.filter((f) => typeof values[f.id] === "string").map((f) => [f.id, values[f.id]]),
    );
    setConnectorValues(allowed);
  }

  const hasRuntime = connector.fields.some((f) => runtimeHas(f.id));
  const hasEnv = connector.envVars.some((e) => Boolean(process.env[e]));
  return NextResponse.json({
    id: connector.id,
    configured: hasRuntime || hasEnv,
    source: hasRuntime ? "runtime" : hasEnv ? "env" : "none",
  });
}
