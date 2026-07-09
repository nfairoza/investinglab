import { SpendingView } from "@/components/spending-view";
import { MoneyInsights } from "@/components/money-insights";
import { InsightStrip } from "@/components/insight-strip";

export const metadata = { title: "Spending" };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">Spending</h1>
        <p className="mt-1 text-sm text-ink-dim">Income vs expenses, by category and merchant.</p>
      </div>
      <InsightStrip page="spending" />
      <SpendingView />
      <MoneyInsights />
    </div>
  );
}
