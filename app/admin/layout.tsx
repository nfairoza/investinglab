import { redirect } from "next/navigation";
import { getUserClient } from "@/lib/supabase-data";
import { AdminNav } from "@/components/admin/admin-nav";

// Server-side gate: only admins can reach anything under /admin. Non-admins are
// redirected. (UI gating elsewhere hides the nav; this is the hard enforcement.)
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getUserClient();
  if (!ctx) redirect("/login");
  if (!ctx.isAdmin) redirect("/");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Admin Portal</h1>
        <p className="mt-1 text-sm text-ink-dim">Operational tools — admin only. Not visible to regular users.</p>
      </div>
      <AdminNav />
      {children}
    </div>
  );
}
