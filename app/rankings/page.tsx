import { Rankings } from "@/components/rankings";

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Rankings</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Stocks scored and ranked by time horizon — short-term momentum, monthly swing, 1-year
          value+growth, and 5-year compounders — plus what to avoid this week and warnings on what
          you own. Each name links to its full research.
        </p>
      </div>
      <Rankings />
    </div>
  );
}
