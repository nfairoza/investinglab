import { NextRequest, NextResponse } from "next/server";
import { resolveApiKey, resolveModel } from "@/lib/ai/anthropic";
import { streamGemini, geminiKey } from "@/lib/ai/gemini";

export const dynamic = "force-dynamic";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface HoldingContext {
  symbol: string;
  shares: number;
  avgCost: number;
  price: number | null;
  gain: number | null;
  gainPct: number | null;
}

interface ChatContext {
  holdings: HoldingContext[];
  watchlist: string[];
  currentPage: string;
}

function buildSystem(ctx: ChatContext): string {
  const holdingLines = ctx.holdings.length
    ? ctx.holdings
        .map((h) => {
          const priceStr = h.price != null ? `$${h.price.toFixed(2)}` : "price unavailable";
          const gainStr =
            h.gain != null && h.gainPct != null
              ? `${h.gain >= 0 ? "▲ up" : "▼ down"} $${Math.abs(h.gain).toFixed(0)} (${h.gainPct.toFixed(1)}%)`
              : "gain unavailable";
          return `  ${h.symbol}: ${h.shares} shares @ avg $${h.avgCost.toFixed(2)} → current ${priceStr} → ${gainStr}`;
        })
        .join("\n")
    : "  (no holdings added yet)";

  const watchStr = ctx.watchlist.length ? ctx.watchlist.join(", ") : "(none)";
  const totalValue = ctx.holdings.reduce(
    (s, h) => s + (h.price != null ? h.price * h.shares : 0),
    0,
  );
  const totalGain = ctx.holdings.reduce((s, h) => s + (h.gain ?? 0), 0);

  return `You are Noor Investing Lab AI, a personal investing assistant. You are embedded in a portfolio dashboard app.

CURRENT PAGE: ${ctx.currentPage}

PORTFOLIO SUMMARY:
  Total value: ~$${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
  Total gain/loss: ${totalGain >= 0 ? "▲ up" : "▼ down"} $${Math.abs(totalGain).toFixed(0)}

HOLDINGS (${ctx.holdings.length} positions):
${holdingLines}

WATCHLIST: ${watchStr}

RULES YOU MUST FOLLOW:
- Be concise — this is a chat, not a report. 2–4 sentences unless they ask for detail.
- Be honest about uncertainty. If you don't know the exact reason for today's move, say so and give likely factors.
- Always separate "good company" from "good stock price today."
- Never give a specific price target without saying it's an estimate with high uncertainty.
- Always mention the biggest risk relevant to the question.
- Never recommend a specific trade action ("buy X shares now") — frame as considerations.
- End substantive analysis answers with: "Educational analysis, not financial advice."
- If asked about a stock not in the portfolio or watchlist, answer generally — you don't have live data for it in this chat.`;
}

// POST /api/chat
// Streams Claude's response using Anthropic's SSE format.
// Body: { messages: ChatMessage[], context: ChatContext }
export async function POST(req: NextRequest) {
  const key = resolveApiKey();
  if (!key && !geminiKey()) {
    return NextResponse.json(
      { error: "no_key", message: "No AI key configured. Add a Claude or Gemini key." },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const messages: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];
  const ctx: ChatContext = body?.context ?? { holdings: [], watchlist: [], currentPage: "/" };

  if (!messages.length) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  const system = buildSystem(ctx);
  const model = resolveModel();
  const recent = messages.slice(-12); // keep last 12 messages for context

  // Try Anthropic streaming first (only if a Claude key exists).
  if (key) {
    try {
      const upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ model, max_tokens: 1024, stream: true, system, messages: recent }),
      });

      if (upstream.ok) {
        return new Response(upstream.body, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
        });
      }
      // Non-OK (auth/4xx) — fall through to Gemini if available, else report.
      if (!geminiKey()) {
        const detail = await upstream.text().catch(() => "");
        return NextResponse.json({ error: "anthropic_error", message: `API error ${upstream.status}: ${detail.slice(0, 200)}` }, { status: 502 });
      }
    } catch {
      // Network failure reaching Anthropic — fall back to Gemini below.
      if (!geminiKey()) {
        return NextResponse.json(
          { error: "no_provider", message: "Claude is unreachable from this network and no Gemini key is set." },
          { status: 502 },
        );
      }
    }
  }

  // ── Gemini fallback: stream, but RE-EMIT in Anthropic SSE shape so the
  // client parser (content_block_delta) needs no changes. ──────────────────
  const gem = await streamGemini({ system, messages: recent });
  if (!gem.ok || !gem.body) {
    const detail = await gem.text().catch(() => "");
    return NextResponse.json({ error: "gemini_error", message: `Gemini error ${gem.status}: ${detail.slice(0, 200)}` }, { status: 502 });
  }

  const reader = gem.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const out = new ReadableStream({
    async start(controller) {
      const emit = (text: string) =>
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text } })}\n\n`,
          ),
        );
      let buf = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const s = line.trim();
            if (!s.startsWith("data:")) continue;
            const json = s.slice(5).trim();
            if (!json || json === "[DONE]") continue;
            try {
              const obj = JSON.parse(json);
              const t = obj?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
              if (t) emit(t);
            } catch { /* skip partial */ }
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(out, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
