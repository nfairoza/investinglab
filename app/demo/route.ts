import { NextResponse } from "next/server";
import { DEMO_COOKIE } from "@/lib/demo/session";

export const dynamic = "force-dynamic";

// GET /demo — start a demo session. Sets the demo cookie (httpOnly, so client JS
// can't forge it) and redirects to the Overview. No real auth user is created;
// the whole session is served from fixtures with writes no-op'd.
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const res = NextResponse.redirect(`${origin}/`, { status: 302 });
  res.cookies.set(DEMO_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 24h — a browsing session, not a login
  });
  return res;
}
