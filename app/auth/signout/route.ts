import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: Request) {
  const supabase = createClient();
  await supabase.auth.signOut();
  const { origin } = new URL(request.url);
  const res = NextResponse.redirect(`${origin}/login`, { status: 302 });
  res.cookies.set("rk_demo", "", { path: "/", maxAge: 0 }); // also end any demo session
  return res;
}
