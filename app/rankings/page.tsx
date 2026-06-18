import { Rankings } from "@/components/rankings";

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold text-[#ece9e0]">Rankings</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-dim">
          Stocks scored and ranked by time horizon — short-term momentum, monthly swing, 1-year
          value+growth, and 5-year compounders — plus what to avoid this week and warnings on what
          you own. Each name links to its full research.
        </p>
      </div>
      <Rankings />
    </div>
  );
}
