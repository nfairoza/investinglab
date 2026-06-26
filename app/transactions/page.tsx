import { Suspense } from "react";
import { TransactionsView } from "@/components/transactions-view";

export const metadata = { title: "Transactions" };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">Transactions</h1>
        <p className="mt-1 text-sm text-ink-dim">Search, filter, and recategorize your spending.</p>
      </div>
      {/* Suspense required: TransactionsView uses useSearchParams (deep-link filter). */}
      <Suspense><TransactionsView /></Suspense>
    </div>
  );
}
