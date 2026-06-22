import { AlertsManager } from "@/components/alerts-manager";

export const metadata = { title: "Alerts" };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Alerts</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-dim">
          Get notified when a stock hits a price, makes a big day move, has earnings coming up, or
          its score changes — checked live while this app is open.
        </p>
      </div>
      <AlertsManager />
    </div>
  );
}
