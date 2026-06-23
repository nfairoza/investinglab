import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session on every request and gates protected routes.
// Public paths (login/signup/auth flow) are always reachable; everything else
// requires an authenticated user, otherwise redirect to /login.
export async function updateSession(request: NextRequest) {
  let res = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          res = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    },
  );

  // getUser() revalidates the token with Supabase. NEVER use getSession() for
  // access control — it trusts the cookie without verifying.
  const { data: { user } } = await supabase.auth.getUser();

  const p = request.nextUrl.pathname;
  const isPublic =
    p.startsWith("/login") ||
    p.startsWith("/signup") ||
    p.startsWith("/forgot-password") ||
    p.startsWith("/reset-password") ||
    p.startsWith("/auth") ||
    // SEO / social crawler assets must be reachable without a session.
    p === "/manifest.webmanifest" ||
    p === "/opengraph-image" ||
    p === "/twitter-image" ||
    p === "/icon.svg" ||
    p === "/apple-icon" ||
    p === "/robots.txt" ||
    p === "/sitemap.xml";

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return res;
}
