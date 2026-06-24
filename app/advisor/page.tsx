import { AdvisorView } from "@/components/advisor-view";

export const metadata = { title: "Advisor" };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">AI Advisor</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Your financial order of operations — emergency fund, high-interest debt, surplus, and
          spending — computed from your real accounts, with Rukmani explaining what to focus on first.
        </p>
      </div>
      <AdvisorView />
    </div>
  );
}
