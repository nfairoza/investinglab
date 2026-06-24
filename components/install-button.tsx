"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

// Captures the browser's PWA install prompt and exposes an "Install app" button.
// On Chrome/Edge/Android the native prompt fires; on iOS Safari there's no
// programmatic prompt, so we show Add-to-Home-Screen instructions instead.
interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

export function InstallButton() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIos, setShowIos] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    // Already running as an installed app? hide the button.
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
    if (standalone) { setInstalled(true); return; }

    setIsIos(/iphone|ipad|ipod/i.test(window.navigator.userAgent) && !/crios|fxios/i.test(window.navigator.userAgent));

    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BIPEvent); };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;
  // Show the button if we have a deferred prompt (Android/desktop) or it's iOS.
  if (!deferred && !isIos) return null;

  async function install() {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
    } else if (isIos) {
      setShowIos(true);
    }
  }

  return (
    <>
      <button onClick={install}
        className="inline-flex items-center gap-2 rounded-lg border border-hairline px-3 py-1.5 text-sm text-ink-dim transition-colors hover:bg-surface hover:text-ink">
        <Download size={15} /> Install rukMoney app
      </button>

      {showIos && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowIos(false)} />
          <div className="relative m-4 w-full max-w-sm rounded-2xl border border-hairline p-5" style={{ background: "var(--surface-solid)" }}>
            <button onClick={() => setShowIos(false)} className="absolute right-3 top-3 text-ink-faint hover:text-ink"><X size={18} /></button>
            <div className="text-sm font-semibold text-ink">Install on iPhone / iPad</div>
            <ol className="mt-3 space-y-2 text-sm text-ink-dim">
              <li>1. Tap the <span className="text-ink">Share</span> button in Safari.</li>
              <li>2. Choose <span className="text-ink">Add to Home Screen</span>.</li>
              <li>3. Tap <span className="text-ink">Add</span> — rukMoney appears like a native app.</li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
