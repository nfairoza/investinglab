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
          {/* Desktop top bar: search on the left, theme + account on the right. */}
          <header className="sticky top-0 z-30 hidden items-center gap-3 border-b border-hairline px-6 py-2.5 md:flex" style={{ background: "color-mix(in oklab, var(--bg) 82%, transparent)", backdropFilter: "blur(8px)" }}>
            <div className="flex-1"><TopSearch /></div>
            <ThemeToggle compact />
            <AccountMenu />
          </header>
          <main className="flex-1 px-5 py-6 md:px-10 md:py-8">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
      </div>
      <ChatWidget />
      <CommandPalette />
    </>
  );
}
