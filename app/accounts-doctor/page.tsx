import { AccountsDoctor } from "@/components/accounts-doctor";

export const metadata = { title: "Accounts Doctor" };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Accounts Doctor</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-dim">
          A full check-up on your money: cash runway, savings rate, emergency fund, debt, recurring
          bills, and a health grade — plus a plain-English diagnosis of what to cut, where money
          should go, and anything alarming.
        </p>
      </div>
      <AccountsDoctor />
    </div>
  );
}
