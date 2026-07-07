import { NextResponse } from "next/server";
import { z, type ZodType } from "zod";

// Shared request-validation helpers (P2). Parse a JSON body or query params
// against a zod schema; on failure return a stable { error, message } 400 the
// UI already knows how to surface — never a raw exception or an unchecked `any`.

export type Validated<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<Validated<T>> {
  let raw: unknown;
  try { raw = await req.json(); } catch { raw = {}; }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { ok: false, response: NextResponse.json({ error: "invalid_request", message: firstIssue(result.error) }, { status: 400 }) };
  }
  return { ok: true, data: result.data };
}

export function parseQuery<T>(url: URL, schema: ZodType<T>): Validated<T> {
  const obj = Object.fromEntries(url.searchParams.entries());
  const result = schema.safeParse(obj);
  if (!result.success) {
    return { ok: false, response: NextResponse.json({ error: "invalid_request", message: firstIssue(result.error) }, { status: 400 }) };
  }
  return { ok: true, data: result.data };
}

function firstIssue(err: z.ZodError): string {
  const i = err.issues[0];
  if (!i) return "Invalid request.";
  const path = i.path.join(".");
  return path ? `${path}: ${i.message}` : i.message;
}

// Common field schemas reused across routes.
export const zSymbol = z.string().trim().min(1).max(12).transform((s) => s.toUpperCase());
