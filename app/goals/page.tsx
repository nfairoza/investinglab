import { GoalsView } from "@/components/money/goals-view";

export const metadata = { title: "Goals" };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-shimmer md:text-3xl">Goals</h1>
        <p className="mt-1 text-sm text-ink-dim">Savings goals with honest, cash-flow-only projections — no market guesses.</p>
      </div>
      <GoalsView />
    </div>
  );
}
