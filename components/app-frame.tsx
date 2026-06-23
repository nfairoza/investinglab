"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { ChatWidget } from "./chat-widget";
import { PageTransition } from "./page-transition";
import { CommandPalette } from "./command-palette";
import { SessionScope } from "./session-scope";
import { AccountMenu } from "./account-menu";
import { ThemeToggle } from "./theme-toggle";

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
      <div className="relative flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Desktop top bar: account menu in the top-right (Vercel/Robinhood style). */}
          <header className="sticky top-0 z-30 hidden items-center justify-end gap-2 border-b border-hairline px-6 py-2.5 md:flex" style={{ background: "color-mix(in oklab, var(--bg) 82%, transparent)", backdropFilter: "blur(8px)" }}>
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
