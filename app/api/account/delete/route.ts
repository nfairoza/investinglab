import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/utils/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// POST /api/account/delete — wipe the signed-in user's data, then delete the
// auth user (requires the service-role key). Data deletion works via RLS even
// without the secret; the auth-user deletion needs SUPABASE_SECRET_KEY.
export async function POST() {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Remove the user's rows (RLS scopes these to them).
  for (const t of ["watchlist", "holdings", "journal", "alerts", "cash", "broker_connections", "user_prefs"]) {
    await supabase.from(t).delete().eq("user_id", user.id);
  }

  // Delete the auth user (needs the service-role key). If absent, sign out only.
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (secret) {
    const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, { auth: { persistSession: false } });
    await admin.auth.admin.deleteUser(user.id).catch(() => {});
  }
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
