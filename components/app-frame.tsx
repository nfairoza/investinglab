"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { ChatWidget } from "./chat-widget";
import { PageTransition } from "./page-transition";
import { CommandPalette } from "./command-palette";
import { SessionScope } from "./session-scope";
import { AccountMenu } from "./account-menu";
import { ThemeToggle } from "./theme-toggle";
import { TopSearch } from "./top-search";
import { MobileTabBar } from "./mobile-tab-bar";
import { SectionSubnav } from "./section-subnav";
import { AddSheet } from "./add-sheet";
import { SwipeSections } from "./swipe-sections";
import { PullToRefresh } from "./pull-to-refresh";
import { SidebarReopen } from "./sidebar-reopen";
import { ThemeGuard } from "./theme-guard";
import { DemoBanner } from "./demo-banner";
import { MarketStatusChip } from "./market-status-chip";
import { OfflineBanner } from "./offline-banner";
import { AlertsBell } from "./alerts-bell";
import { NotificationsBell } from "./notifications-bell";
import { ViewTransitions } from "./view-transitions";
import { ToastHost } from "./toast-host";
import { NavTiming } from "./nav-timing";

// Auth screens render with NO app chrome (no sidebar, chat, or command palette) —
// just the page. Everything else gets the full shell.
const AUTH_ROUTES = ["/login", "/signup", "/forgot-password", "/reset-password", "/auth"];

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const isAuth = AUTH_ROUTES.some((r) => pathname.startsWith(r));

  // M1.1 — register the service worker for the offline shell (network-only for
  // /api/*, offline fallback on failed navigation). Push subscribe stays a
  // separate, opt-in step. Registration is idempotent.
  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* SW optional */ });
    }
  }, []);

  if (isAuth) return <>{children}</>;

  return (
    <>
      <ThemeGuard />
      <ViewTransitions />
      <NavTiming />
      <SessionScope />
      <OfflineBanner />
      <DemoBanner />
      {/* Column on mobile (top bar stacks above content), row on desktop (sidebar
          beside content). */}
      <div className="relative flex min-h-screen flex-col md:flex-row">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Desktop top bar: search left; + Add, theme, account right. */}
          <header className="sticky top-0 z-30 hidden items-center gap-3 border-b border-hairline px-6 py-2.5 md:flex" style={{ background: "color-mix(in oklab, var(--bg) 82%, transparent)", backdropFilter: "blur(8px)" }}>
            <SidebarReopen />
            <div className="flex-1"><TopSearch /></div>
            <MarketStatusChip />
            <NotificationsBell />
            <AlertsBell />
            <ThemeToggle compact />
            <AccountMenu />
          </header>
          {/* Section sub-nav (Invest / Money) sits under the top bar. */}
          <SectionSubnav />
          {/* pb on mobile leaves room for the fixed bottom tab bar. */}
          <main className="flex-1 px-5 py-6 pb-24 md:px-10 md:py-8 md:pb-8">
            <PullToRefresh>
              <SwipeSections><PageTransition>{children}</PageTransition></SwipeSections>
            </PullToRefresh>
          </main>
        </div>
      </div>
      <MobileTabBar />
      <AddSheet />
      <ChatWidget />
      <CommandPalette />
      <ToastHost />
    </>
  );
}
