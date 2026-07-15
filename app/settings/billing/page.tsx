import { Pricing } from "@/components/billing/pricing";
import { ManageBilling } from "@/components/billing/manage-billing";

export const metadata = { title: "Billing — rukMoney" };

export default function Page() {
  return (
    <div className="space-y-6 py-6">
      <ManageBilling />
      <Pricing />
    </div>
  );
}
