"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { ChatWidget } from "./chat-widget";
import { PageTransition } from "./page-transition";
import { CommandPalette } from "./command-palette";
import { SessionScope } from "./session-scope";

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
        <main className="flex-1 px-5 py-6 md:px-10 md:py-8">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
      <ChatWidget />
      <CommandPalette />
    </>
  );
}
