import { CacheSettings } from "@/components/cache-settings";
import { AccountCard } from "@/components/account-card";

export const metadata = { title: "Settings" };
export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Settings</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-dim">
          Your account and app preferences.
        </p>
      </div>

      <AccountCard />

      <CacheSettings />

      <div className="rounded-xl glass p-5 text-sm text-ink-dim">
        Coming soon: base currency, default Beginner mode. Theme can be toggled from the sidebar.
      </div>
    </div>
  );
}
