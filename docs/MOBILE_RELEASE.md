# Mobile release — PWA today, native shell when you're ready

rukMoney's mobile story has three layers. **The first two ship from this repo with
no extra tooling. The third (native app store builds) needs software and accounts
that only you can provide** — this doc is explicit about which is which so nothing
looks "done" that actually isn't.

| Layer | What it is | Ships from this repo? | Needs from you |
|---|---|---|---|
| **Responsive web** (M0) | Touch targets, tables→cards, swipe/scroll, dvh, safe-area | ✅ deployed with the web app | nothing |
| **PWA** (M1) | Installable, offline shell, web push | ✅ deployed with the web app | VAPID keys (below) |
| **Native shell** (M2) | iOS/Android apps in the stores | ⚠️ **scaffold only** | Xcode / Android Studio / store accounts (below) |

## What's already live (no action needed)

- **Installable PWA** — manifest + icons + service worker (`public/sw.js`). On
  Android/desktop Chrome users get an install prompt; on iOS Safari, Share → "Add
  to Home Screen" (the app coaches this — M1.3).
- **Offline shell** — a failed navigation while offline serves `/offline` instead
  of a browser error. `/api/*` is never cached (live financial data only).
- **Web push** — subscription + VAPID send path is wired (M1.2). It only needs the
  keys set (next section); without them push is a graceful no-op.

## One env step to finish PWA push

Generate a VAPID keypair and set it in Vercel + `.env.local`:

```
npx web-push generate-vapid-keys
```

Set `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, and optionally
`WEB_PUSH_SUBJECT` (default `mailto:alerts@rukmoney.com`). That's the whole PWA
push setup — see `docs/DEPLOY_CHECKLIST.md`.

---

## Native shell (M2) — what this repo provides vs. what you must do

This repo ships a **remote-mode Capacitor scaffold**, not a buildable app:

- `mobile/capacitor.config.ts` — remote-mode config. The native WebView loads the
  **live deployed site** (`server.url`, default `https://rukmoney.com`, override
  with `CAP_SERVER_URL`) rather than a bundled export. One deploy stays the source
  of truth; content updates without an App Store round-trip.
- `mobile/public-shell/index.html` — placeholder `webDir` (never served; only
  satisfies `cap sync`).
- `lib/native.ts` — runtime bridge. `isNative()`, `platform()`, `isStandalonePwa()`,
  `isAppShell()`, `pushTransport()`. Feature-detects the injected `Capacitor`
  global, so the **web build takes no dependency on Capacitor** and behaves
  identically in the browser. Native capabilities light up automatically inside
  the shell with no further code changes here.

### ⚠️ These steps require software/accounts only you have

None of the following can be done from this environment — they need a Mac and/or
native SDKs and paid developer accounts:

1. **Install native tooling** (your machine):
   - `npm i -D @capacitor/cli && npm i @capacitor/core @capacitor/ios @capacitor/android`
   - iOS: **macOS + Xcode** (App Store builds are macOS-only). Android: **Android Studio + JDK**.
2. **Initialize the native projects** from the scaffold:
   - `npx cap init --config mobile/capacitor.config.ts` (or copy the config to root)
   - `npx cap add ios` / `npx cap add android`, then `npx cap sync`.
3. **Developer accounts** (paid, yours):
   - Apple Developer Program ($99/yr) — signing, provisioning, App Store Connect.
   - Google Play Console ($25 one-time).
4. **Native push (APNs/FCM)** — optional upgrade over web push inside the shell:
   - Add `@capacitor/push-notifications`; register the device token and POST it to
     `/api/push/subscribe` with `platform: "ios" | "android"`. The
     `push_subscriptions.platform` column (migration 0032) and `pushTransport()`
     in `lib/native.ts` already anticipate this — the send path in `lib/push/send.ts`
     is web-only today and would need an APNs/FCM branch keyed off `platform`.
   - Requires an APNs key (Apple) and an FCM project (Google).
5. **Store assets & review** — app icons at store sizes, screenshots, privacy
   nutrition labels, and Apple's "minimum functionality" bar: a WebView wrapper
   can be rejected as "just a website." The native-only wins to justify it:
   push, biometric unlock (Face ID / fingerprint), and native share. Budget review
   time.
6. **iOS splash images** — not generated here (needs an image pipeline + Xcode
   asset catalog). Config references a solid-color splash as a safe default.

### Suggested build order when you pick this up

1. Set VAPID keys → PWA push fully working (no native needed).
2. Ship the PWA and gather install/usage signal.
3. Only if the stores are worth it: do steps 1–3 above, get a remote-mode shell
   running against staging, then add native push + biometric unlock before submitting.
