// M2 — native bridge.
//
// rukMoney ships as a Capacitor "remote-mode" shell: the native iOS/Android app
// is a thin WebView that loads the deployed web app (server.url in
// mobile/capacitor.config.ts). That means the SAME web bundle runs in three
// places — browser, installed PWA, and native shell — and this module is the one
// place that answers "where am I running, and what native capabilities do I have?"
//
// Design constraint: we do NOT take a hard dependency on @capacitor/core in the
// web build (it would need the native toolchains to be meaningful and would bloat
// the browser bundle). Instead we feature-detect the `Capacitor` global that the
// native runtime injects into the WebView. On the web this is simply absent and
// every helper degrades to its browser behavior. When the native project is
// actually built (see docs/MOBILE_RELEASE.md), the plugins register themselves on
// this same global and these checks light up with zero code changes here.

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, unknown>;
};

function cap(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** True only inside the Capacitor native shell (iOS/Android), false in any browser/PWA. */
export function isNative(): boolean {
  const c = cap();
  return !!c && typeof c.isNativePlatform === "function" && c.isNativePlatform();
}

/** "ios" | "android" | "web". Drives platform-specific copy and the push transport. */
export function platform(): "ios" | "android" | "web" {
  const c = cap();
  const p = c && typeof c.getPlatform === "function" ? c.getPlatform() : "web";
  return p === "ios" || p === "android" ? p : "web";
}

/** True when running as an installed PWA (standalone display), independent of native. */
export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  const mm = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  // iOS Safari uses the legacy navigator.standalone flag instead of display-mode.
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return !!mm || iosStandalone;
}

/** Any "app-like" surface (native shell OR installed PWA) — for hiding browser-only affordances. */
export function isAppShell(): boolean {
  return isNative() || isStandalonePwa();
}

/**
 * Which push transport this surface should use.
 *  - "web"    → Web Push (VAPID) via the service worker (browser + PWA). Wired today (M1.2).
 *  - "native" → APNs/FCM via a Capacitor push plugin. NOT wired yet — the token would be
 *               registered against push_subscriptions with platform "ios"/"android" (the column
 *               already exists, added in migration 0032 for exactly this). See MOBILE_RELEASE.md.
 */
export function pushTransport(): "web" | "native" {
  return isNative() ? "native" : "web";
}
