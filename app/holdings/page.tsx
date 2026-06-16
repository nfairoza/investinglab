import { HoldingsManager } from "@/components/holdings-manager";

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Holdings</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Add the stocks you own and how many shares. The app pulls a live price and works out your
          value, gain/loss, and how much of your portfolio each one is.
        </p>
      </div>
      <div className="rounded-lg border border-brand-500/20 bg-brand-500/5 p-3 text-sm text-brand-200">
        <span className="font-medium">What should I look at first?</span> Your total value, then the
        gain/loss column, then the weight column — if one stock is a very large weight, you&apos;re
        concentrated.
      </div>
      <HoldingsManager />
    </div>
  );
}
