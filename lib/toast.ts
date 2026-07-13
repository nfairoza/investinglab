"use client";

// SMOOTH S4 — tiny toast bus. No dependency: fire a window CustomEvent (same
// pattern as the app's existing open-nav / open-add / ask-rukmani events) and let
// the mounted <ToastHost> render it. Importable from any client module without a
// React context, so mutation handlers (and their rollback paths) can call
// toast("…") from anywhere.

export type ToastKind = "error" | "success" | "info";
export interface ToastPayload { message: string; kind?: ToastKind }

export function toast(message: string, kind: ToastKind = "info"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastPayload>("app-toast", { detail: { message, kind } }));
}

// Convenience: the rollback-on-error case in optimistic mutations.
export function toastError(message: string): void { toast(message, "error"); }
