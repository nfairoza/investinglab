import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { demoSupabase, demoAuthUser } from "./client";
import { DEMO_USER } from "./fixtures";

// Demo mode is a cookie-flagged, DB-free session. There is no real Supabase user:
// requests carrying the demo cookie are served by the fake client (lib/demo/
// client.ts) reading fixtures, with all writes no-op'd. This keeps the real
// business logic (net-worth math, live pricing, overview assembly) running
// end-to-end while guaranteeing the real database is never touched.

export const DEMO_COOKIE = "rk_demo";

// True when the current request is a demo session (cookie present).
export function isDemoRequest(): boolean {
  try { return cookies().get(DEMO_COOKIE)?.value === "1"; } catch { return false; }
}

// The demo identity used by /api/me and /api/overview so the UI greets the demo
// user without a real auth user behind it.
export function demoIdentity() {
  return {
    authenticated: true,
    isAdmin: false,
    email: DEMO_USER.email,
    createdAt: demoAuthUser.created_at,
    provider: "demo",
    avatarUrl: null,
    fullName: DEMO_USER.fullName,
    phone: null,
    isDemo: true,
  };
}

// The ctx shape getUserClient() returns, backed by the fake client. isAdmin is
// always false so admin-only routes (rescans, connectors, error log) stay closed
// in demo — visitors see the cached/sample experience, never privileged actions.
export function makeDemoContext(): { supabase: SupabaseClient; userId: string; isAdmin: boolean } {
  return { supabase: demoSupabase(), userId: DEMO_USER.id, isAdmin: false };
}
