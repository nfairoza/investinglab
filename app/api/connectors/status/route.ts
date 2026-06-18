import { NextResponse } from "next/server";
import { CONNECTORS } from "@/lib/connectors/registry";
import { runtimeHas } from "@/lib/connectors/runtime";

export const dynamic = "force-dynamic";

// Reports per-connector configured/source. Never returns any key value.
export async function GET() {
  const status = CONNECTORS.map((c) => {
    // Configured if any of the connector's own fields OR its backing env vars are
    // set — checking BOTH runtime (entered in the UI) and process.env. So an
    // FMP-backed connector (e.g. News) reports configured when the FMP key is
    // present, even without its own dedicated key.
    const hasRuntime = c.fields.some((f) => runtimeHas(f.id)) || c.envVars.some((e) => runtimeHas(e));
    const hasEnv = c.envVars.some((e) => Boolean(process.env[e]));
    return {
      id: c.id,
      configured: hasRuntime || hasEnv,
      source: hasRuntime ? "runtime" : hasEnv ? "env" : "none",
    };
  });
  return NextResponse.json({ connectors: status });
}
