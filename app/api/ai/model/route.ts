import { NextRequest, NextResponse } from "next/server";
import { setRuntimeModel } from "@/lib/ai/runtime-key";
import { aiStatus } from "@/lib/ai/anthropic";
import { parseBody } from "@/lib/validate";
import { z } from "zod";

export const dynamic = "force-dynamic";

// POST { model }  -> set ONLY the model for this session (key stays as-is).
// Lets the Settings picker change the model without re-entering the API key.
export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, z.object({ model: z.string().optional() }));
  if (!parsed.ok) return parsed.response;
  const model = parsed.data.model ?? "";
  if (!model.trim()) return NextResponse.json({ error: "model required" }, { status: 400 });
  await setRuntimeModel(model);
  return NextResponse.json(aiStatus());
}
