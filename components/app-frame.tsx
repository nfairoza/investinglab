"use client";

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
import { Plus } from "lucide-react";

// Auth screens render with NO app chrome (no sidebar, chat, or command palette) —
// just the page. Everything else gets the full shell.
const AUTH_ROUTES = ["/login", "/signup", "/forgot-password", "/reset-password", "/auth"];

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const isAuth = AUTH_ROUTES.some((r) => pathname.startsWith(r));

  if (isAuth) return <>{children}</>;

  return (
    <>
      <SessionScope />
      {/* Column on mobile (top bar stacks above content), row on desktop (sidebar
          beside content). */}
      <div className="relative flex min-h-screen flex-col md:flex-row">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Desktop top bar: search left; + Add, theme, account right. */}
          <header className="sticky top-0 z-30 hidden items-center gap-3 border-b border-hairline px-6 py-2.5 md:flex" style={{ background: "color-mix(in oklab, var(--bg) 82%, transparent)", backdropFilter: "blur(8px)" }}>
            <div className="flex-1"><TopSearch /></div>
            <button onClick={() => window.dispatchEvent(new Event("open-add"))}
              className="btn-gold inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm">
              <Plus size={15} /> Add
            </button>
            <ThemeToggle compact />
            <AccountMenu />
          </header>
          {/* Section sub-nav (Invest / Money) sits under the top bar. */}
          <SectionSubnav />
          {/* pb on mobile leaves room for the fixed bottom tab bar. */}
          <main className="flex-1 px-5 py-6 pb-24 md:px-10 md:py-8 md:pb-8">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
      </div>
      <MobileTabBar />
      <AddSheet />
      <ChatWidget />
      <CommandPalette />
    </>
  );
}
