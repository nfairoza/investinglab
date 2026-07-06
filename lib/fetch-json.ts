// Shared SWR/fetch helper that THROWS on non-2xx instead of silently returning
// the error body as if it were data. Many older fetchers did `r.json()` on a 404
// and then treated the `{error}` payload as a valid (empty) result — which hid
// real failures behind "no data" UI. Throwing lets SWR surface `error` so the
// UI can show a proper error state (see components/data-state.tsx).
export class FetchError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "FetchError";
    this.status = status;
    this.body = body;
  }
}

export async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  let body: unknown = null;
  const text = await r.text();
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!r.ok) {
    const msg =
      (body && typeof body === "object" && "message" in body && typeof (body as any).message === "string" && (body as any).message) ||
      (body && typeof body === "object" && "error" in body && typeof (body as any).error === "string" && (body as any).error) ||
      `Request failed (${r.status})`;
    throw new FetchError(r.status, msg, body);
  }
  return body as T;
}
