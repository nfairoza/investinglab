import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { ChatWidget } from "@/components/chat-widget";

export const metadata: Metadata = {
  title: "Noor Investing Lab",
  description: "Personal investing dashboard — research and education, not financial advice.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 px-5 py-6 md:px-8">{children}</main>
        </div>
        <ChatWidget />
      </body>
    </html>
  );
}
