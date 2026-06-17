import { DashboardClient } from "@/components/dashboard-client";
import { Hero } from "@/components/hero";

export default function Dashboard() {
  return (
    <div className="mx-auto max-w-5xl">
      <Hero />
      <DashboardClient />
    </div>
  );
}
