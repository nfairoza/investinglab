import { DashboardClient } from "@/components/dashboard-client";

export const metadata = { title: "Investing dashboard" };

// The original investing dashboard, kept available under /dashboard. The home
// route (/) is now the Overview. Linked from the Invest section.
export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <DashboardClient />
    </div>
  );
}
