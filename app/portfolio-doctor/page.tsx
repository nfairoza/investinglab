import { PortfolioDoctor } from "@/components/portfolio-doctor";

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold text-[#ece9e0]">Portfolio Doctor</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-dim">
          A full check-up on your portfolio: concentration and sector risk, a health grade, and
          specific buy/sell amounts for each holding (plus new ideas) across 1-day, 1-month,
          6-month, 1-year, and 5-year horizons.
        </p>
      </div>
      <PortfolioDoctor />
    </div>
  );
}
