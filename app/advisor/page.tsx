import { AdvisorView } from "@/components/advisor-view";

export const metadata = { title: "Advisor" };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">AI Advisor</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Rukmani reviews your whole financial picture and gives a personalized health check.
        </p>
      </div>
      <AdvisorView />
    </div>
  );
}
