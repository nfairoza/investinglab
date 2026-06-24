"use client";

import { Menu } from "lucide-react";
import { Blossom } from "./ui/primitives";
import { useSidebarCollapsed } from "./use-sidebar";

// Lives in the desktop top bar. Only visible when the sidebar is collapsed.
// Shows the full rukMoney wordmark + logo with a small burger, so it reads as
// "this is rukMoney — click to open the menu". Clicking expands the sidebar
// (it does NOT navigate). Content reflows, no blur.
export function SidebarReopen() {
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  if (!collapsed) return null;
  return (
    <button
      onClick={() => setCollapsed(false)}
      aria-label="Show navigation"
      title="Show navigation"
      className="group flex items-center gap-2.5 rounded-lg px-2 py-1 transition-opacity hover:opacity-80"
    >
      <Menu size={16} className="text-ink-faint group-hover:text-ink" />
      <Blossom className="h-8 w-8" />
      <div className="leading-tight text-left">
        <div className="font-display text-[17px] font-bold tracking-tight">
          <span className="text-ink">ruk</span><span className="text-shimmer">Money</span>
        </div>
        <div className="text-[9px] font-medium tracking-[0.3em] uppercase text-ink-faint">AI Wealth</div>
      </div>
    </button>
  );
}
