"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

// Shows a thin banner when the browser goes offline, so live-data pages (quotes,
// research) don't look "broken" — they're just disconnected. Hides itself the
// moment connectivity returns. No polling: uses the native online/offline events.
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="offline-banner" role="status">
      <WifiOff className="h-3.5 w-3.5" aria-hidden />
      You&apos;re offline — showing the last loaded data. Live prices resume when you reconnect.
    </div>
  );
}
