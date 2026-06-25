import { Screener } from "@/components/screener";

export const metadata = { title: "Screeners" };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Screeners</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-dim">
          Find stocks that match your criteria — market cap, price, volume, beta, sector, and more.
          Tap a trending list or build your own filter. Each result links to full research.
        </p>
      </div>
      <Screener />
    </div>
  );
}
