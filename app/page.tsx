import { DashboardClient } from "@/components/dashboard-client";

export default function Dashboard() {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold text-slate-100">Dashboard</h1>
      <DashboardClient />
    </div>
  );
}
