import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { ChatWidget } from "@/components/chat-widget";
import { PageTransition } from "@/components/page-transition";

// NOTE: fonts are loaded browser-side via <link> below (see <head>), NOT via
// next/font. On AMD's corporate network the build-time font download is blocked
// by the SSL filter (UNABLE_TO_GET_ISSUER_CERT_LOCALLY); loading in the browser
// uses the OS cert store, which works. The CSS vars --font-sans / --font-display
// are set in globals.css so Tailwind's font-sans/font-display keep working.

export const metadata: Metadata = {
  title: "Noor Investing Lab",
  description: "Personal investing dashboard — research and education, not financial advice.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Cormorant+Garamond:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans">
        {/* Layered parallax background (fixed) */}
        <div className="bg-aurora" aria-hidden />
        <div className="bg-vines" aria-hidden />

        <div className="relative flex min-h-screen">
          <Sidebar />
          <main className="flex-1 px-5 py-6 md:px-10 md:py-8">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
        <ChatWidget />
      </body>
    </html>
  );
}
