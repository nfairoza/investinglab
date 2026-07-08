import type { Metadata, Viewport } from "next";
import { Sora, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppFrame } from "@/components/app-frame";
import { SwrProvider } from "@/components/swr-provider";
import { SpeedInsights } from "@vercel/speed-insights/next";

// Self-hosted via next/font (PA-A4): no render-blocking Google Fonts <link>, no
// font flash. display=swap; only the weights actually used. The CSS variables
// below feed the existing --font-display/--font-sans/--font-mono tokens.
// Display = Sora (matches the rukMoney wordmark); UI = Inter Tight; numbers =
// JetBrains Mono.
const sora = Sora({ subsets: ["latin"], weight: ["500", "600", "700", "800"], display: "swap", variable: "--font-sora" });
const interTight = Inter_Tight({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-inter-tight" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", variable: "--font-jetbrains" });

const DESCRIPTION =
  "rukMoney — your banking, spending, and brokerage portfolio, unified and predicted by AI. Research and education, not financial advice.";

export const metadata: Metadata = {
  title: { default: "rukMoney", template: "%s · rukMoney" },
  description: DESCRIPTION,
  metadataBase: new URL("https://rukmoney.com"),
  applicationName: "rukMoney",
  appleWebApp: { capable: true, title: "rukMoney", statusBarStyle: "black-translucent" },
  openGraph: {
    type: "website",
    siteName: "rukMoney",
    title: "rukMoney",
    description: DESCRIPTION,
    url: "https://rukmoney.com",
    // opengraph-image.tsx supplies the image automatically.
  },
  twitter: {
    card: "summary_large_image",
    title: "rukMoney",
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0A0C0F" },
    { media: "(prefers-color-scheme: light)", color: "#F7F8FA" },
  ],
};

// No-FOUC theme init: set the class on <html> before first paint.
// No-FOUC theme init. The theme is a deliberate user choice: we read the saved
// value and ONLY fall back to the OS preference the very first time (no saved
// value yet), then persist it so it never changes on its own afterward. This
// makes the theme stable across full-page loads — it only changes when the user
// clicks the toggle (which writes 'theme').
const themeInit = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';localStorage.setItem('theme',t);}var d=document.documentElement;d.classList.remove('light','dark');d.classList.add(t);d.style.colorScheme=t;}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sora.variable} ${interTight.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="font-sans">
        {/* Layered background: aurora mesh + vine texture + film grain (fixed) */}
        <div className="bg-aurora" aria-hidden />
        <div className="bg-vines" aria-hidden />
        <div className="bg-grain" aria-hidden />

        <SwrProvider>
          <AppFrame>{children}</AppFrame>
        </SwrProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
