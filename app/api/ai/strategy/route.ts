import { NextRequest, NextResponse } from "next/server";
import { setRuntimeStrategy } from "@/lib/ai/runtime-key";
import { aiStatus } from "@/lib/ai/anthropic";
import { parseBody } from "@/lib/validate";
import { z } from "zod";

export const dynamic = "force-dynamic";

// POST { strategy: "smart" | "quality" | "economy" } -> set routing strategy for
// this session. Controls how the task router picks models per task.
export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, z.object({ strategy: z.string().optional() }));
  if (!parsed.ok) return parsed.response;
  const s = String(parsed.data.strategy ?? "").toLowerCase();
  if (!["smart", "quality", "economy"].includes(s)) {
    return NextResponse.json({ error: "strategy must be smart|quality|economy" }, { status: 400 });
  }
  await setRuntimeStrategy(s);
  return NextResponse.json(aiStatus());
}
