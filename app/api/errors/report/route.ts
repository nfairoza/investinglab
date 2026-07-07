import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { logError, type ErrorCategory } from "@/lib/error-log";
import { parseBody } from "@/lib/validate";
import { z } from "zod";

export const dynamic = "force-dynamic";

// POST /api/errors/report — any authenticated user (or the client) can report a
// user-facing error so it shows up in the Admin Portal. The user never sees this
// data; they just get a generic message in the UI. Body:
//   { message, category?, section?, statusCode?, path?, severity? }
export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  // Still log even if unauthenticated (rare), but capture identity when present.
  const parsed = await parseBody(req, z.object({
    message: z.string().optional(),
    category: z.string().optional(),
    section: z.string().optional(),
    statusCode: z.number().optional(),
    path: z.string().optional(),
    severity: z.string().optional(),
  }));
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const message = String(body.message ?? "").slice(0, 4000);
  if (!message) return NextResponse.json({ ok: false }, { status: 400 });

  let email: string | null = null;
  if (ctx) {
    const { data } = await ctx.supabase.auth.getUser();
    email = data.user?.email ?? null;
  }

  await logError({
    message,
    category: body?.category as ErrorCategory | undefined,
    section: typeof body?.section === "string" ? body.section : undefined,
    statusCode: typeof body?.statusCode === "number" ? body.statusCode : undefined,
    path: typeof body?.path === "string" ? body.path : undefined,
    severity: body?.severity === "warning" || body?.severity === "info" ? body.severity : "error",
    userId: ctx?.userId ?? null,
    userEmail: email,
  });

  return NextResponse.json({ ok: true });
}
