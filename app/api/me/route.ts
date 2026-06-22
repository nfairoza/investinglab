import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { isAdminUser } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// Returns the current user's identity + admin flag for UI gating (hide the
// Connectors nav, etc.). The real enforcement is server-side in each admin route;
// this is just for showing/hiding UI.
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ authenticated: false, isAdmin: false });
  return NextResponse.json({
    authenticated: true,
    isAdmin: isAdminUser(user),
    email: user.email ?? null,
  });
}
