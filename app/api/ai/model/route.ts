import { NextRequest, NextResponse } from "next/server";
import { setRuntimeModel } from "@/lib/ai/runtime-key";
import { aiStatus } from "@/lib/ai/anthropic";

export const dynamic = "force-dynamic";

// POST { model }  -> set ONLY the model for this session (key stays as-is).
// Lets the Settings picker change the model without re-entering the API key.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const model = typeof body?.model === "string" ? body.model : "";
  if (!model.trim()) return NextResponse.json({ error: "model required" }, { status: 400 });
  setRuntimeModel(model);
  return NextResponse.json(aiStatus());
}
