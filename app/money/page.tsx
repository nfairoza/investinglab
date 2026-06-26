import { MoneyDashboard } from "@/components/money-dashboard";

export const metadata = { title: "Money" };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-shimmer md:text-3xl">Money</h1>
        <p className="mt-1 text-sm text-ink-dim">Your connected accounts, spending, and an AI read on where it&apos;s going.</p>
      </div>
      <MoneyDashboard />
    </div>
  );
}
