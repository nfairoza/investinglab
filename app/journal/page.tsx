import { Journal } from "@/components/journal";

export const metadata = { title: "Journal" };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Trade Journal</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-dim">
          Log every trade: why you entered, your target, your stop-loss, and what would make you
          exit — then record how it did after a week and a month. This is how you learn what works.
        </p>
      </div>
      <Journal />
    </div>
  );
}
