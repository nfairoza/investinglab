// M1.2 — client-side web push enablement. Registers the push service worker,
// asks for Notification permission, subscribes with the server's VAPID public
// key, and posts the subscription to /api/push/subscribe. All best-effort: any
// unsupported browser / denied permission returns a reason, never throws.

export type PushEnableResult = { ok: true } | { ok: false; reason: string };

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function enablePush(): Promise<PushEnableResult> {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  try {
    const keyRes = await fetch("/api/push/subscribe");
    const { publicKey } = await keyRes.json();
    if (!publicKey) return { ok: false, reason: "not_configured" };

    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { ok: false, reason: "denied" };

    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    const existing = await reg.pushManager.getSubscription();
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const json = sub.toJSON();
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, platform: "web" }),
    });
    if (!res.ok) return { ok: false, reason: "save_failed" };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "error" };
  }
}
