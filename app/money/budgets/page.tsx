import { BudgetsView } from "@/components/money/budgets-view";

export const metadata = { title: "Budgets" };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">Budgets</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Set a monthly limit per category — suggested from your own typical spending, always editable.
          Budgets reset on the 1st; we&apos;ll nudge you at 80% and 100%.
        </p>
      </div>
      <BudgetsView />
    </div>
  );
}
