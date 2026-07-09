import { RecurringView } from "@/components/recurring-view";
import { InsightStrip } from "@/components/insight-strip";

export const metadata = { title: "Recurring" };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">Recurring</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-dim">
          Your subscriptions and recurring bills, detected from your transactions — with a flag when a
          charge goes up in price.
        </p>
      </div>
      <InsightStrip page="recurring" />
      <RecurringView />
    </div>
  );
}
