import { NextResponse } from "next/server";
import { DEMO_COOKIE } from "@/lib/demo/session";

export const dynamic = "force-dynamic";

// Clear the demo cookie and return to /login. Supports both GET (link) and POST
// (form/button) so the banner can use either.
function clearDemo(request: Request) {
  const { origin } = new URL(request.url);
  const res = NextResponse.redirect(`${origin}/login`, { status: 302 });
  res.cookies.set(DEMO_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

export async function GET(request: Request) { return clearDemo(request); }
export async function POST(request: Request) { return clearDemo(request); }
