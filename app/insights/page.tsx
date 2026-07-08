import { InsightsView } from "@/components/insights-view";

export const metadata = { title: "Insights" };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">Insights</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-dim">
          Rukmani watches your money and surfaces what&apos;s worth a look — every number is computed
          from your own transactions, and &ldquo;Show me why&rdquo; opens the exact evidence behind it.
        </p>
      </div>
      <InsightsView />
    </div>
  );
}
