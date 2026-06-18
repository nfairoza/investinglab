"use client";

import { usePathname } from "next/navigation";

// Re-mounts its children on every route change (keyed by pathname) so the
// page content plays a fade-in-up entrance. Purely presentational.
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-page-in">
      {children}
    </div>
  );
}
