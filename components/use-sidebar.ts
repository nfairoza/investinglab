"use client";

import { useEffect, useState } from "react";

// Shared desktop-sidebar collapse state. Persisted to localStorage and synced
// across components (the sidebar's collapse button + the top bar's reopen button)
// via a window event — no context provider needed. Mobile uses its own drawer.
const KEY = "sidebar-collapsed";
const EVENT = "sidebar-collapsed-change";

function read(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
}

export function useSidebarCollapsed(): [boolean, (v: boolean) => void] {
  const [collapsed, setCollapsedState] = useState(false);

  // Hydrate from localStorage after mount (avoids SSR mismatch) + listen for
  // changes dispatched by the other button.
  useEffect(() => {
    setCollapsedState(read());
    const onChange = () => setCollapsedState(read());
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  const setCollapsed = (v: boolean) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY, v ? "1" : "0");
      window.dispatchEvent(new Event(EVENT));
    }
    setCollapsedState(v);
  };

  return [collapsed, setCollapsed];
}
