import type { CapacitorConfig } from "@capacitor/cli";

// M2 — Capacitor "remote-mode" native shell config.
//
// This is intentionally a REMOTE shell: instead of bundling the Next.js output
// into the app (webDir), the native WebView loads the live deployed site
// (server.url). Rationale:
//   - rukMoney is a server-rendered Next.js app with API routes, per-user auth,
//     and cron — it is not a static export, so there is no self-contained webDir
//     to ship. Remote mode keeps ONE deploy as the source of truth; the app
//     updates the instant the web app does (no App Store round-trip for content).
//   - Trade-off: the app requires connectivity to be useful (acceptable — it
//     shows live balances; the M1.1 offline page covers the disconnected case),
//     and Apple expects genuine native value beyond a website (we add native
//     push + biometric unlock + share — see MOBILE_RELEASE.md before submitting).
//
// This file does NOT build anything on its own. Turning it into runnable iOS /
// Android projects requires the native toolchains and store accounts documented
// in docs/MOBILE_RELEASE.md. The web app is unaffected by this directory.

const SERVER_URL = process.env.CAP_SERVER_URL || "https://rukmoney.com";

const config: CapacitorConfig = {
  appId: "com.rukmoney.app",
  appName: "rukMoney",
  // No local web assets — remote mode. `npx cap sync` still needs the key to
  // exist; we point it at an empty placeholder that is never actually served.
  webDir: "public-shell",
  server: {
    url: SERVER_URL,
    cleartext: false,
  },
  ios: {
    contentInset: "always",
  },
  android: {
    // Allow the app to reach the deployed HTTPS origin only.
    allowMixedContent: false,
  },
  plugins: {
    // Native splash while the remote page loads; matches the PWA maskable icon bg.
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: "#0B0B0F",
      showSpinner: false,
    },
  },
};

export default config;
