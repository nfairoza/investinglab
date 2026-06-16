import { NextResponse } from "next/server";
import { CONNECTORS } from "@/lib/connectors/registry";
import { runtimeHas } from "@/lib/connectors/runtime";

export const dynamic = "force-dynamic";

// Reports per-connector configured/source. Never returns any key value.
export async function GET() {
  const status = CONNECTORS.map((c) => {
    const hasRuntime = c.fields.some((f) => runtimeHas(f.id));
    const hasEnv = c.envVars.some((e) => Boolean(process.env[e]));
    return {
      id: c.id,
      configured: hasRuntime || hasEnv,
      source: hasRuntime ? "runtime" : hasEnv ? "env" : "none",
    };
  });
  return NextResponse.json({ connectors: status });
}
