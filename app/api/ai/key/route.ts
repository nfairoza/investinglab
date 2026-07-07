import { NextRequest, NextResponse } from "next/server";
import { setRuntimeAi } from "@/lib/ai/runtime-key";
import { aiStatus } from "@/lib/ai/anthropic";
import { getAdminClient } from "@/lib/supabase-data";
import { parseBody } from "@/lib/validate";
import { z } from "zod";

export const dynamic = "force-dynamic";

// POST { apiKey, model? } -> store in server memory for this dev session.
// POST { clear: true }     -> forget the runtime key.
// The key is received by the server and held server-side only; it is never
// echoed back and never stored in the browser. Admin-only (platform key).
export async function POST(req: NextRequest) {
  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: "forbidden", message: "Admin only." }, { status: 403 });
  const parsed = await parseBody(req, z.object({
    clear: z.boolean().optional(),
    apiKey: z.string().optional(),
    model: z.string().optional(),
  }));
  if (!parsed.ok) return parsed.response;
  const { clear, apiKey: rawKey, model: rawModel } = parsed.data;
  if (clear) {
    await setRuntimeAi(null, null);
    return NextResponse.json(aiStatus());
  }
  const apiKey = rawKey ?? "";
  const model = rawModel ?? null;
  if (!apiKey.trim()) {
    return NextResponse.json({ error: "apiKey required" }, { status: 400 });
  }
  await setRuntimeAi(apiKey, model);
  return NextResponse.json(aiStatus());
}
