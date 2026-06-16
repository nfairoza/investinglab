import { NextResponse } from "next/server";
import { aiStatus } from "@/lib/ai/anthropic";

export const dynamic = "force-dynamic";

// Returns ONLY whether a key is configured + which source + the model.
// Never returns the key itself.
export async function GET() {
  return NextResponse.json(aiStatus());
}
