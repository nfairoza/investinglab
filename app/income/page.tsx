import { IncomeView } from "@/components/income-view";

export const metadata = { title: "Income" };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">Income</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-dim">
          Dividend income from your holdings — projected annual income, forward yield, yield on cost,
          and a payout calendar. Estimates from dividend history, not guarantees.
        </p>
      </div>
      <IncomeView />
    </div>
  );
}
