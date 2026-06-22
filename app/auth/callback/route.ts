import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// OAuth / email-confirm / password-reset all land here with a `code` to exchange
// for a session. `next` lets the reset flow continue to /reset-password.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("Could not sign in")}`);
}
