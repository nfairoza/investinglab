import { Journal } from "@/components/journal";

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold text-[#ece9e0]">Trade Journal</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Log every trade: why you entered, your target, your stop-loss, and what would make you
          exit — then record how it did after a week and a month. This is how you learn what works.
        </p>
      </div>
      <Journal />
    </div>
  );
}
