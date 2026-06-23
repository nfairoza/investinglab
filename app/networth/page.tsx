import { NetWorthView } from "@/components/networth-view";

export const metadata = { title: "Net worth" };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">Net worth</h1>
        <p className="mt-1 text-sm text-ink-dim">Everything you own and owe, in one place.</p>
      </div>
      <NetWorthView />
    </div>
  );
}
