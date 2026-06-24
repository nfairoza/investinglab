import { redirect } from "next/navigation";

// Congress was renamed to Power Trades. Preserve the old URL.
export default function Page() {
  redirect("/power-trades");
}
