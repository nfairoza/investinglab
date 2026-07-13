"use client";

import useSWR from "swr";
import { isEntitled, type Feature, type Plan } from "@/lib/billing/entitlements";

// Client-side entitlement check for UI gating (mirrors useIsAdmin). Reads the
// user's plan + admin flag from /api/me and applies the pure isEntitled() gate.
// REAL enforcement is server-side; this only decides what to SHOW. While billing
// is disabled (the default), this returns true for everyone.
export function useEntitlement(feature: Feature): boolean {
  const { data } = useSWR<{ plan?: Plan; isAdmin?: boolean; billingEnabled?: boolean }>(
    "/api/me",
    (u: string) => fetch(u).then((r) => r.json()),
    { revalidateOnFocus: false },
  );
  // Default to entitled until /api/me resolves, so gated UI doesn't flash-hide on
  // load. isEntitled itself returns true for everyone when billing is off.
  if (!data) return true;
  return isEntitled(feature, data.plan ?? "free", Boolean(data.isAdmin));
}
