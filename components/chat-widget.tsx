"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X, Send, RotateCcw } from "lucide-react";
import useSWR from "swr";
import type { Holding, WatchItem } from "@/lib/db";
import type { DataResult, Quote } from "@/lib/providers/types";

// ── types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
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
  "Why am I up or down today?",
  "Which holding has the most risk right now?",
  "Am I too concentrated in any one stock?",
  "What should I be watching this week?",
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

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [noKey, setNoKey] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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

  // Auto-scroll to bottom on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  function uid() {
    return Math.random().toString(36).slice(2);
  }

  async function send(text?: string) {
    const userText = (text ?? input).trim();
    if (!userText || streaming) return;
    setInput("");
    setNoKey(false);

    const userMsg: Message = { id: uid(), role: "user", content: userText };
    const assistantId = uid();
    const assistantMsg: Message = { id: assistantId, role: "assistant", content: "", streaming: true };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
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
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "Connection error — check that the dev server is running.", streaming: false }
            : m,
        ),
      );
    } finally {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)),
      );
      setStreaming(false);
    }
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
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`fixed bottom-5 right-5 z-50 flex h-13 w-13 items-center justify-center rounded-full shadow-lg transition-all
          ${open ? "bg-slate-700 hover:bg-slate-600" : "bg-brand-600 hover:bg-brand-500"}`}
        style={{ width: 52, height: 52 }}
        aria-label="Open AI chat"
      >
        {open ? <X size={20} className="text-white" /> : <MessageCircle size={20} className="text-white" />}
      </button>

      {/* Chat panel — slides up from button */}
      {open && (
        <div className="fixed bottom-20 right-4 z-50 flex w-[360px] flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
          style={{ height: 520 }}>

          {/* Header */}
          <div className="flex items-center justify-between rounded-t-2xl border-b border-slate-800 bg-slate-900/80 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-slate-100">Noor Investing Lab</div>
              <div className="text-[11px] text-slate-500">
                Knows your {holdings.length} holding{holdings.length !== 1 ? "s" : ""}
                {watchlist.length > 0 ? ` + ${watchlist.length} watchlist` : ""}
              </div>
            </div>
            <button onClick={clearChat} title="Clear chat"
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300">
              <RotateCcw size={14} />
            </button>
          </div>

          {/* No-key banner */}
          {noKey && (
            <div className="mx-3 mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              No Claude API key. Add one in{" "}
              <a href="/connectors" className="underline" onClick={() => setOpen(false)}>Connectors</a>.
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-center text-xs text-slate-500 pt-2">Ask anything about your portfolio</p>
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap
                  ${m.role === "user"
                    ? "bg-brand-600 text-white rounded-br-sm"
                    : "bg-slate-800 text-slate-200 rounded-bl-sm"
                  }`}>
                  {m.content || (m.streaming ? <span className="animate-pulse text-slate-400">▌</span> : "")}
                  {m.streaming && m.content && <span className="animate-pulse text-slate-400">▌</span>}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-slate-800 px-3 py-2">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask about your portfolio… (Enter to send)"
                rows={1}
                disabled={streaming}
                className="flex-1 resize-none rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none disabled:opacity-50"
                style={{ maxHeight: 96, overflowY: "auto" }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 96) + "px";
                }}
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || streaming}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white hover:bg-brand-600 disabled:opacity-40"
              >
                <Send size={15} />
              </button>
            </div>
            <p className="mt-1 text-center text-[10px] text-slate-600">
              Educational analysis, not financial advice.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
