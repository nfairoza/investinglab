"use client";

import { PanelLeftOpen } from "lucide-react";
import { Blossom } from "./ui/primitives";
import { useSidebarCollapsed } from "./use-sidebar";

// Lives in the desktop top bar. Only visible when the sidebar is collapsed —
// click to bring it back. The logo doubles as the affordance so it reads as
// "rukMoney / open nav". Reopening just flips state; content reflows, no blur.
export function SidebarReopen() {
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  if (!collapsed) return null;
  return (
    <button
      onClick={() => setCollapsed(false)}
      aria-label="Show sidebar"
      title="Show sidebar"
      className="flex items-center gap-2 rounded-md border border-hairline px-2 py-1.5 text-ink-dim transition-colors hover:bg-surface hover:text-ink"
    >
      <PanelLeftOpen size={16} />
      <Blossom className="h-5 w-5" />
    </button>
  );
}
