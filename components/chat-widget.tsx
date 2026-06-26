"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { X, ArrowUp, RotateCcw, Minus, Maximize2, Minimize2, ImagePlus, Square } from "lucide-react";

// Rukmani mark: an AI "spark" cluster — a large 4-point sparkle with two smaller
// companion sparkles, the visual language users read as "AI assistant". White on
// the glowing brand disc, legible in both themes.
function RukmaniMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" className="relative" aria-hidden="true">
      {/* main sparkle — concave 4-point star */}
      <path d="M12 2.2c.7 4.6 2.5 6.4 7.1 7.1-4.6.7-6.4 2.5-7.1 7.1-.7-4.6-2.5-6.4-7.1-7.1 4.6-.7 6.4-2.5 7.1-7.1Z"
        fill="white" fillOpacity="0.97" />
      {/* small companion sparkles */}
      <path d="M18.5 14.2c.28 1.6.92 2.24 2.5 2.5-1.58.26-2.22.9-2.5 2.5-.28-1.6-.92-2.24-2.5-2.5 1.58-.26 2.22-.9 2.5-2.5Z"
        fill="white" fillOpacity="0.85" />
      <circle cx="5.3" cy="17.4" r="1.05" fill="white" fillOpacity="0.7" />
    </svg>
  );
}
import useSWR from "swr";
import type { Holding, WatchItem } from "@/lib/db";
import type { DataResult, Quote } from "@/lib/providers/types";
import { renderMarkdown } from "@/lib/markdown";

// ── types ────────────────────────────────────────────────────────────────────

interface ChatImage {
  mediaType: string; // image/png, image/jpeg…
  data: string; // base64, no prefix
  preview: string; // data: URL for display
}
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: ChatImage[];
  streaming?: boolean;
}

interface HoldingContext {
  symbol: string;
  shares: number;
  avgCost: number;
  price: number | null;
  gain: number | null;
  gainPct: number | null;
}

// ── suggested starter questions ──────────────────────────────────────────────

const SUGGESTIONS = [
  "Why is my portfolio up or down today?",
  "Which holding has the most risk right now?",
  "What does the Research tab do, and how do I use it?",
  "Explain P/E ratio like I'm new",
  "Be my advisor — what should I do with my portfolio?",
];

// ── quote fetcher for context ─────────────────────────────────────────────────

async function fetchQuotes(symbols: string[]): Promise<Record<string, DataResult<Quote>>> {
  const entries = await Promise.all(
    symbols.map(async (s) => {
      try {
        const r = await fetch(`/api/quote?symbol=${s}`);
        return [s, (await r.json()) as DataResult<Quote>] as const;
      } catch {
        return [s, { data: null, source: "unavailable", asOf: null, provider: "client" } as DataResult<Quote>] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

// ── SSE parser: extracts text deltas from Anthropic's stream ─────────────────

function parseSSEChunk(chunk: string): string {
  let text = "";
  const lines = chunk.split("\n");
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const data = line.slice(6).trim();
    if (data === "[DONE]" || !data) continue;
    try {
      const json = JSON.parse(data);
      if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
        text += json.delta.text ?? "";
      }
    } catch {
      // skip malformed lines
    }
  }
  return text;
}

// ── main widget ───────────────────────────────────────────────────────────────

// Panel size presets (width × height in px). "full" docks to the right edge.
const SIZES = {
  compact: { w: 360, h: 520, label: "Compact" },
  large: { w: 460, h: 680, label: "Large" },
  full: { w: 520, h: 0, label: "Full height" }, // h:0 → full viewport height
} as const;
type SizeKey = keyof typeof SIZES;

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [size, setSize] = useState<SizeKey>("compact");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [noKey, setNoKey] = useState(false);
  const [pendingImages, setPendingImages] = useState<ChatImage[]>([]);
  const [mounted, setMounted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Lets the user abort an in-flight response (the Stop button).
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();

  const { data: holdings = [] } = useSWR<Holding[]>("/api/holdings", (url: string) => fetch(url).then((r) => r.json()), { revalidateOnFocus: false });
  const { data: watchlist = [] } = useSWR<WatchItem[]>("/api/watchlist", (url: string) => fetch(url).then((r) => r.json()), { revalidateOnFocus: false });

  const symbols = holdings.map((h) => h.symbol);
  const { data: quotes } = useSWR(
    symbols.length ? ["chat-quotes", symbols.join(",")] : null,
    () => fetchQuotes(symbols),
    { refreshInterval: 60_000, keepPreviousData: true },
  );

  // Build holding context with live prices
  const holdingContext: HoldingContext[] = holdings.map((h) => {
    const price = quotes?.[h.symbol]?.data?.price ?? null;
    const value = price != null ? price * h.shares : null;
    const cost = h.avgCost * h.shares;
    const gain = value != null ? value - cost : null;
    const gainPct = gain != null && cost > 0 ? (gain / cost) * 100 : null;
    return { symbol: h.symbol, shares: h.shares, avgCost: h.avgCost, price, gain, gainPct };
  });

  // Portals need the DOM — only render after mount.
  useEffect(() => setMounted(true), []);

  // Cross-device continuity: load the saved conversation once on mount. The
  // server returns it only if the session is still active (<1h idle); otherwise
  // it's a fresh start. `historyLoaded` gates saving so we don't overwrite the
  // stored history with an empty array before the load resolves.
  const historyLoaded = useRef(false);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/chat/history");
        const j = await r.json();
        if (Array.isArray(j.messages) && j.messages.length) setMessages(j.messages as Message[]);
      } catch { /* ignore — start fresh */ }
      finally { historyLoaded.current = true; }
    })();
  }, []);

  // Persist the conversation (debounced) whenever it changes, but not while a
  // response is still streaming (avoids saving half-finished turns). Each save
  // slides the 1-hour idle window forward server-side.
  useEffect(() => {
    if (!historyLoaded.current || streaming) return;
    const t = setTimeout(() => {
      fetch("/api/chat/history", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // Drop image blobs from persistence — too large for the prefs row; keep
        // text so the thread reads continuously across devices.
        body: JSON.stringify({ messages: messages.map((m) => ({ id: m.id, role: m.role, content: m.content })) }),
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [messages, streaming]);

  // Auto-scroll the MESSAGE LIST to its bottom (not the whole page). Using
  // scrollIntoView scrolls the nearest scrollable ancestor — which here is the
  // document — yanking the page down whenever the panel opens. Scroll the
  // inner container directly instead so the page never moves.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  // Allow any part of the app (e.g. the Help page) to open the chat via a global
  // event: window.dispatchEvent(new Event("open-chat")).
  useEffect(() => {
    function openChat() { setOpen(true); setMinimized(false); }
    window.addEventListener("open-chat", openChat);
    return () => window.removeEventListener("open-chat", openChat);
  }, []);

  // Let other parts of the app ask Rukmani a specific question:
  //   window.dispatchEvent(new CustomEvent("ask-rukmani", { detail: { prompt } }))
  // Opens the chat and auto-sends the prompt. We stash it and fire after open so
  // send() runs with fresh state on the next tick.
  const queuedPrompt = useRef<string | null>(null);
  useEffect(() => {
    function onAsk(e: Event) {
      const prompt = (e as CustomEvent<{ prompt?: string }>).detail?.prompt;
      if (!prompt) return;
      setOpen(true); setMinimized(false);
      queuedPrompt.current = prompt;
    }
    window.addEventListener("ask-rukmani", onAsk as EventListener);
    return () => window.removeEventListener("ask-rukmani", onAsk as EventListener);
  }, []);

  // When a queued prompt exists and we're open + not streaming, send it once.
  useEffect(() => {
    if (open && !streaming && queuedPrompt.current) {
      const p = queuedPrompt.current;
      queuedPrompt.current = null;
      void send(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, streaming]);

  // On phones the chat docks as a full-width bottom sheet instead of a fixed
  // floating box (which would be cramped / could cover content).
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  function uid() {
    return Math.random().toString(36).slice(2);
  }

  // Read an image File into a base64 ChatImage (caps total to 4 images).
  function addFiles(files: FileList | File[]) {
    const imgs = Array.from(files).filter((f) => f.type.startsWith("image/"));
    imgs.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result); // data:image/png;base64,XXXX
        const comma = result.indexOf(",");
        const data = comma >= 0 ? result.slice(comma + 1) : result;
        setPendingImages((prev) => prev.length >= 4 ? prev : [...prev, { mediaType: file.type, data, preview: result }]);
      };
      reader.readAsDataURL(file);
    });
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const it of Array.from(items)) {
      if (it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) { e.preventDefault(); addFiles(files); }
  }

  function removePending(idx: number) {
    setPendingImages((prev) => prev.filter((_, i) => i !== idx));
  }

  async function send(text?: string) {
    const userText = (text ?? input).trim();
    const imgs = pendingImages;
    // Allow sending if there's text OR at least one image.
    if ((!userText && imgs.length === 0) || streaming) return;
    setInput("");
    setPendingImages([]);
    setNoKey(false);

    const userMsg: Message = { id: uid(), role: "user", content: userText, images: imgs.length ? imgs : undefined };
    const assistantId = uid();
    const assistantMsg: Message = { id: assistantId, role: "assistant", content: "", streaming: true };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Send messages with text OR images (drop empty assistant placeholders)
          // so the API never sees a blank turn (which 400s). Strip the data-URL
          // preview; the server only needs mediaType + base64 data.
          messages: [...messages, userMsg]
            .filter((m) => m.content.trim() || m.images?.length)
            .map((m) => ({
              role: m.role,
              content: m.content,
              images: m.images?.map((img) => ({ mediaType: img.mediaType, data: img.data })),
            })),
          context: {
            holdings: holdingContext,
            watchlist: watchlist.map((w) => w.symbol),
            currentPage: pathname,
          },
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if ((j as any).error === "no_key") setNoKey(true);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: (j as any).message ?? "Something went wrong.", streaming: false }
              : m,
          ),
        );
        return;
      }

      // Read SSE stream
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const eol = buffer.lastIndexOf("\n");
        if (eol === -1) continue;
        const chunk = buffer.slice(0, eol + 1);
        buffer = buffer.slice(eol + 1);

        const delta = parseSSEChunk(chunk);
        if (delta) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + delta } : m,
            ),
          );
        }
      }
    } catch (e) {
      // User pressed Stop → keep whatever streamed so far, append a marker.
      if (e instanceof DOMException && e.name === "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content ? m.content + " …(stopped)" : "(stopped)", streaming: false }
              : m,
          ),
        );
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: "Connection error — check that the dev server is running.", streaming: false }
              : m,
          ),
        );
      }
    } finally {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)),
      );
      setStreaming(false);
      abortRef.current = null;
    }
  }

  // Abort the in-flight response. The fetch/stream throws AbortError, which the
  // catch above handles by keeping the partial text.
  function stop() {
    abortRef.current?.abort();
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function clearChat() {
    setMessages([]);
    setNoKey(false);
    fetch("/api/chat/history", { method: "DELETE" }).catch(() => {});
  }

  if (!mounted) return null;

  // Render through a portal to <body> so no ancestor's transform/filter can
  // re-anchor our position:fixed panel (that's what pinned it to the left and
  // made it move on scroll). Anchored to the viewport, it stays bottom-right.
  return createPortal(
    <>
      {/* Floating button — Rukmani. A glowing gradient disc with a chat-spark
          glyph + a slow living pulse ring, so it reads as a smart assistant
          (not a static chat bubble). Legible in light and dark. */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="group flex items-center justify-center rounded-full transition-all duration-200 hover:scale-110 active:scale-95"
        style={{
          position: "fixed",
          bottom: isMobile ? "calc(76px + env(safe-area-inset-bottom))" : "calc(20px + env(safe-area-inset-bottom))",
          right: "calc(20px + env(safe-area-inset-right))",
          left: "auto", zIndex: 50, width: 56, height: 56,
          background: open ? "var(--surface-solid)" : "linear-gradient(140deg, #16D27E 0%, #0EA6C9 100%)",
          border: open ? "1px solid var(--hairline-strong)" : "none",
          boxShadow: open ? "var(--shadow, 0 4px 14px rgba(0,0,0,0.25))" : "0 6px 20px rgba(16,166,201,0.45)",
        }}
        aria-label="Chat with Rukmani"
        title="Ask Rukmani"
      >
        {!open && (
          <span className="pointer-events-none absolute inset-0 rounded-full opacity-50 animate-ping"
            style={{ background: "radial-gradient(circle, rgba(22,210,126,0.6) 0%, transparent 70%)", animationDuration: "3s" }} />
        )}
        {open
          ? <X size={20} className="relative text-ink" />
          : <RukmaniMark />}
      </button>

      {/* Chat panel — scales up from the button. Positioning is INLINE (not
          Tailwind) so it's anchored to the viewport's right side and cannot be
          overridden/re-anchored by any stylesheet or ancestor. */}
      {open && (
        <div
          className={`glass animate-scale-in flex flex-col shadow-2xl ${isMobile ? "rounded-t-2xl" : size === "full" ? "rounded-l-2xl" : "rounded-2xl"}`}
          style={isMobile ? {
            // Phone: full-width bottom sheet, respecting safe-area insets.
            position: "fixed",
            zIndex: 50,
            left: 0,
            right: 0,
            bottom: 0,
            top: minimized ? "auto" : "10vh",
            width: "100vw",
            maxWidth: "100vw",
            height: minimized ? 52 : "auto",
            paddingBottom: "env(safe-area-inset-bottom)",
            background: "var(--surface-solid)",
            transition: "height 200ms ease",
          } : {
            position: "fixed",
            zIndex: 50,
            right: size === "full" ? 0 : 16,
            bottom: size === "full" ? 0 : 80,
            top: size === "full" ? 0 : "auto",
            left: "auto",
            width: SIZES[size].w,
            height: size === "full" ? "100vh" : (minimized ? 52 : SIZES[size].h),
            maxWidth: "95vw",
            transformOrigin: "bottom right",
            background: "var(--surface-solid)",
            transition: "height 200ms ease, width 200ms ease",
          }}
        >
          {/* Header (click to minimize/restore) */}
          <div className="flex items-center justify-between border-b border-hairline bg-white/[0.03] px-4 py-3"
            style={{ borderTopLeftRadius: size === "full" ? 16 : 16, borderTopRightRadius: size === "full" ? 0 : 16 }}>
            <button onClick={() => setMinimized((m) => !m)} className="flex-1 text-left" title={minimized ? "Expand" : "Minimize"}>
              <div className="text-sm font-semibold text-ink">Rukmani · AI assistant</div>
              {!minimized && (
                <div className="text-[11px] text-ink-faint">
                  Live data + web search · {holdings.length} holding{holdings.length !== 1 ? "s" : ""}
                  {watchlist.length > 0 ? ` + ${watchlist.length} watch` : ""}
                </div>
              )}
            </button>
            <div className="flex items-center gap-0.5">
              {/* cycle size */}
              <button
                onClick={() => setSize((s) => (s === "compact" ? "large" : s === "large" ? "full" : "compact"))}
                title={`Size: ${SIZES[size].label} (click to change)`}
                className="rounded-md p-1.5 text-ink-faint hover:bg-surface-raised hover:text-ink-dim">
                {size === "full" ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
              <button onClick={() => setMinimized((m) => !m)} title="Minimize"
                className="rounded-md p-1.5 text-ink-faint hover:bg-surface-raised hover:text-ink-dim">
                <Minus size={14} />
              </button>
              <button onClick={clearChat} title="Clear chat"
                className="rounded-md p-1.5 text-ink-faint hover:bg-surface-raised hover:text-ink-dim">
                <RotateCcw size={14} />
              </button>
              <button onClick={() => setOpen(false)} title="Close"
                className="rounded-md p-1.5 text-ink-faint hover:bg-surface-raised hover:text-ink-dim">
                <X size={14} />
              </button>
            </div>
          </div>

          {!minimized && (<>
          {/* spacer marker for the collapsible body */}

          {/* No-key banner */}
          {noKey && (
            <div className="mx-3 mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              No Claude API key. Add one in{" "}
              <a href="/connectors" className="underline" onClick={() => setOpen(false)}>Connectors</a>.
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-center text-xs text-ink-faint pt-2">Hi, I&apos;m Rukmani — ask me anything about your portfolio</p>
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)}
                    className="w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-left text-xs text-ink-dim hover:bg-surface-raised hover:text-ink transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed
                  ${m.role === "user"
                    ? "bg-brand-600 text-white rounded-br-sm whitespace-pre-wrap"
                    : "bg-surface-raised text-ink rounded-bl-sm"
                  }`}>
                  {m.role === "assistant" ? (
                    m.content ? (
                      <span className="chat-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) + (m.streaming ? '<span class="animate-pulse">▌</span>' : "") }} />
                    ) : (
                      m.streaming ? <span className="animate-pulse text-ink-dim">▌</span> : ""
                    )
                  ) : (
                    <div className="space-y-1.5">
                      {m.images?.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {m.images.map((img, idx) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={idx} src={img.preview} alt="attachment" className="max-h-40 rounded-lg border border-white/20" />
                          ))}
                        </div>
                      ) : null}
                      {m.content && <div className="whitespace-pre-wrap">{m.content}</div>}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-hairline px-3 py-2">
            {/* Pending image previews */}
            {pendingImages.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {pendingImages.map((img, idx) => (
                  <div key={idx} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.preview} alt="pending" className="h-14 w-14 rounded-lg border border-white/20 object-cover" />
                    <button
                      onClick={() => removePending(idx)}
                      className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-surface-raised text-ink-dim ring-1 ring-white/20 hover:bg-rose-600 hover:text-white"
                      title="Remove">
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={streaming || pendingImages.length >= 4}
                title="Attach image"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-hairline text-ink-dim hover:bg-surface-raised hover:text-ink disabled:opacity-40">
                <ImagePlus size={16} />
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                onPaste={handlePaste}
                placeholder=""
                rows={1}
                disabled={streaming}
                className="flex-1 resize-none rounded-xl border border-hairline bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none disabled:opacity-50"
                style={{ maxHeight: 96, overflowY: "auto" }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 96) + "px";
                }}
              />
              {streaming ? (
                <button
                  onClick={stop}
                  title="Stop generating"
                  aria-label="Stop generating"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-hairline-strong bg-surface-raised text-ink hover:bg-surface"
                >
                  <Square size={13} className="fill-current" />
                </button>
              ) : (
                <button
                  onClick={() => send()}
                  disabled={!input.trim() && pendingImages.length === 0}
                  title="Send"
                  aria-label="Send"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white transition-transform hover:scale-105 disabled:opacity-40"
                  style={{
                    background: "linear-gradient(140deg, #16D27E 0%, #0EA6C9 100%)",
                    boxShadow: "0 4px 14px rgba(16,166,201,0.45)",
                  }}
                >
                  <ArrowUp size={16} />
                </button>
              )}
            </div>
            <p className="mt-1 text-center text-[10px] text-ink-faint">
              Educational analysis, not financial advice.
            </p>
          </div>
          </>)}
        </div>
      )}
    </>,
    document.body,
  );
}
