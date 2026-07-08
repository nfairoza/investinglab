import { HoldingsManager } from "@/components/holdings-manager";

export const metadata = { title: "Holdings" };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Holdings</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-dim">
          Add the stocks you own and how many shares. The app pulls a live price and works out your
          value, gain/loss, and how much of your portfolio each one is.
        </p>
      </div>
      <div className="rounded-lg border border-[var(--hairline-gold)] bg-[var(--accent-soft)] p-3 text-sm text-ink">
        <span className="font-medium">What should I look at first?</span> Your total value, then the
        gain/loss column, then the weight column — if one stock is a very large weight, you&apos;re
        concentrated.
      </div>
      <HoldingsManager />
    </div>
  );
}
