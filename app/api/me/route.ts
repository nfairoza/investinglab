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
    createdAt: user.created_at ?? null,
    provider: (user.app_metadata?.provider as string) ?? "email",
    avatarUrl: (user.user_metadata?.avatar_url as string) ?? (user.user_metadata?.picture as string) ?? null,
    fullName: (user.user_metadata?.full_name as string) ?? (user.user_metadata?.name as string) ?? null,
    phone: (user.user_metadata?.phone as string) ?? user.phone ?? null,
  });
}
