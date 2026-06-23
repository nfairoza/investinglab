import { AccountCard } from "@/components/account-card";

export const metadata = { title: "Profile" };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Profile</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-dim">
          Your account details, profile info, and password.
        </p>
      </div>
      <AccountCard />
    </div>
  );
}
