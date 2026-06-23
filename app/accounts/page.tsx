import { AccountsView } from "@/components/accounts-view";

export const metadata = { title: "Accounts" };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">Accounts</h1>
        <p className="mt-1 text-sm text-ink-dim">Balances across your linked banks, cards, and brokerages.</p>
      </div>
      <AccountsView />
    </div>
  );
}
