import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { ChatWidget } from "@/components/chat-widget";
import { PageTransition } from "@/components/page-transition";
import { CommandPalette } from "@/components/command-palette";

// Fonts load browser-side via <link> (corp SSL blocks build-time next/font fetch).
// Display serif = Fraunces (optical sizing); UI = Inter Tight; numbers = JetBrains Mono.

export const metadata: Metadata = {
  title: { default: "Noor Investing Lab", template: "%s · Noor Investing Lab" },
  description: "A beautiful, beginner-friendly investing research dashboard — research and education, not financial advice.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0A0C0F" },
    { media: "(prefers-color-scheme: light)", color: "#F7F8FA" },
  ],
};

// No-FOUC theme init: set the class on <html> before first paint.
const themeInit = `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}var d=document.documentElement;d.classList.remove('light','dark');d.classList.add(t);d.style.colorScheme=t;}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans">
        {/* Layered background: aurora mesh + vine texture + film grain (fixed) */}
        <div className="bg-aurora" aria-hidden />
        <div className="bg-vines" aria-hidden />
        <div className="bg-grain" aria-hidden />

        <div className="relative flex min-h-screen">
          <Sidebar />
          <main className="flex-1 px-5 py-6 md:px-10 md:py-8">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
        <ChatWidget />
        <CommandPalette />
      </body>
    </html>
  );
}
