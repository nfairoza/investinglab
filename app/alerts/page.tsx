import { PageShell } from "@/components/page-shell";

export const metadata = { title: "Alerts" };

export default function Page() {
  return (
    <PageShell
      title="Alerts"
      phase="Phase 7"
      first="Set an alert for when a stock hits your buy zone or breaks its support level."
    />
  );
}
