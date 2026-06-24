import { Overview } from "@/components/overview";

export const metadata = { title: "Overview" };

export default function OverviewPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">Overview</h1>
        <p className="mt-1 text-sm text-ink-dim">Your whole financial life at a glance.</p>
      </div>
      <Overview />
    </div>
  );
}
