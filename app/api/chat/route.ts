import { NextRequest, NextResponse } from "next/server";
import { resolveApiKey, resolveModel } from "@/lib/ai/anthropic";
import { streamGemini, geminiKey } from "@/lib/ai/gemini";
import { marketData } from "@/lib/providers";

export const dynamic = "force-dynamic";

interface ChatImage {
  mediaType: string; // e.g. "image/png"
  data: string; // base64 (no data: prefix)
}
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  images?: ChatImage[];
}

// Build Anthropic message content: text + optional image blocks (vision).
function toAnthropicMessages(msgs: ChatMessage[]) {
  return msgs.map((m) => {
    if (m.images?.length) {
      const blocks: any[] = m.images.map((img) => ({
        type: "image",
        source: { type: "base64", media_type: img.mediaType, data: img.data },
      }));
      if (m.content.trim()) blocks.push({ type: "text", text: m.content });
      return { role: m.role, content: blocks };
    }
    return { role: m.role, content: m.content };
  });
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

// Pull tickers mentioned in the latest user message (and the current page),
// then fetch live quote + recent news so the model has real data to answer with.
async function gatherLiveData(messages: ChatMessage[], ctx: ChatContext): Promise<string> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  // Candidate tickers: 1-5 uppercase letters as standalone words, plus page symbol.
  const mentioned = Array.from(new Set((lastUser.toUpperCase().match(/\b[A-Z]{1,5}\b/g) ?? [])));
  const known = new Set([
    ...ctx.holdings.map((h) => h.symbol),
    ...ctx.watchlist,
  ]);
  const pageSym = ctx.currentPage.match(/\/holdings\/([A-Za-z]{1,5})/)?.[1]?.toUpperCase();
  // Prioritise: page symbol, then known portfolio tickers mentioned, then any mention.
  const stop = new Set(["A","I","AI","THE","IS","IT","MY","WHY","HOW","ETF","CEO","USD","AND","FOR","ALL","NEW","BUY","ADD"]);
  const candidates = Array.from(new Set([
    ...(pageSym ? [pageSym] : []),
    ...mentioned.filter((t) => known.has(t)),
    ...mentioned.filter((t) => !stop.has(t)),
  ])).slice(0, 3); // cap to 3 to limit API calls

  if (!candidates.length) return "";

  const blocks = await Promise.all(
    candidates.map(async (sym) => {
      const [quote, news] = await Promise.all([
        marketData.getQuote(sym),
        marketData.getNews(sym).catch(() => null),
      ]);
      if (!quote.data) return null;
      const q = quote.data;
      const newsLines = (news?.data ?? [])
        .slice(0, 5)
        .map((n) => `    - ${n.title} (${n.source}) ${n.url}`)
        .join("\n");
      return `${sym} — $${q.price} (${q.changePct >= 0 ? "+" : ""}${q.changePct?.toFixed(2)}% today), 52wk $${q.week52Low}–$${q.week52High}, mkt cap ${q.marketCap}
  Recent news:\n${newsLines || "    (none)"}`;
    }),
  );
  const live = blocks.filter(Boolean).join("\n\n");
  return live ? `\n\nLIVE DATA (fetched just now for tickers in the question):\n${live}` : "";
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

  return `You are Noor Investing Lab AI — Noor's personal investment banker, financial advisor, and patient finance teacher, embedded inside the Noor Investing Lab app. Speak with the depth of a seasoned analyst but explain like a great teacher: clear, plain-English, no condescension.

WHO YOU ARE / HOW TO BEHAVE:
- Act as a financial advisor + investment banker: give real, reasoned opinions and analysis, not vague disclaimers. Take a view, justify it with data.
- Be a teacher: when you use a term (P/E, RSI, DCF, free cash flow, moving average, dilution, etc.), define it briefly the first time so Noor learns. If Noor asks "what does X mean," explain it simply with an analogy.
- When Noor asks "why is X the way it is," investigate: use the LIVE DATA below + web search + your reasoning to explain the actual drivers, not generic filler.

CURRENT PAGE: ${ctx.currentPage}

PORTFOLIO SUMMARY:
  Total value: ~$${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
  Total gain/loss: ${totalGain >= 0 ? "▲ up" : "▼ down"} $${Math.abs(totalGain).toFixed(0)}

HOLDINGS (${ctx.holdings.length} positions):
${holdingLines}

WATCHLIST: ${watchStr}

YOUR DATA & TOOLS (use them — never say "I don't have data"):
- Vision: Noor can paste or attach images (charts, screenshots, statements). Read them carefully and analyze what's shown — describe the chart pattern, extract numbers, explain what it means.
- Web search for current news, prices, events.
- LIVE DATA injected below (current price, % move, 52-week range, recent news with links) for tickers in the question — quote these numbers and cite the article links.
- Full research analysis on demand: valuation, thesis, bull/bear, risks, catalysts, scenarios, price zones.

YOU ALSO KNOW THIS APP INSIDE-OUT — help Noor navigate it and explain what each part does:
- Dashboard (/) — portfolio value, day's & total gain, allocation donut, top winners/losers, market overview (SPY/QQQ/VIX).
- Holdings (/holdings) — your owned positions with live price, value, day's gain, total gain ($ & %), weight; sync from E*TRADE or import Robinhood CSV; filter by source; click a ticker for its detail page.
- Holdings detail (/holdings/SYMBOL) — full per-stock view: score, price-zone bar, price + moving-average charts, revenue/margin charts, insider trades, and an AI research memo with the Action Table.
- Watchlist (/watchlist) — stocks you're considering; set an ideal buy price; the "Analyze" button has AI fill fair value, bull/bear case, catalyst, and an action.
- Research (/research) — enter any ticker for a transparent rules-based SCORE plus company profile, analyst consensus, DCF fair value, charts, insider activity, and a skeptical AI memo (A–P sections, "Explain Like I'm New" toggle).
- Rankings (/rankings) — stocks scored & ranked by horizon (1wk momentum, 1mo swing, 1yr value+growth, 5yr compounders), what to avoid this week, and warnings on what you own.
- Predictions (/predictions) — AI researches a stock (live data + web) and gives a probabilistic up/down/flat call for 1 week / 1 month / 1 year with confidence and biggest risk.
- Portfolio Doctor (/portfolio-doctor) — health check on your whole portfolio (concentration, risk).
- Congress (/congress) — disclosed congressional stock trades (lagged disclosure, ranges).
- Alerts (/alerts) — price/earnings/weight alerts.
- Journal (/journal) — log trades (why you entered, target, stop, exit plan, 1wk/1mo results) to learn over time.
- Glossary (/glossary) — plain-English definitions of every finance term.
- Connectors (/connectors) — API keys, grouped: AI providers (Claude, Gemini), Brokerage (E*TRADE, Robinhood), Finance data (FMP, News, Congress).
- The chat (you) floats on every page.
When Noor asks where to do something or what a section is for, point them to the exact page and explain it. When it helps, suggest the relevant page (e.g. "open Research for AAPL to see the full memo").

RULES:
- Default concise; go deep when asked for analysis or teaching.
- Cite news article links from the LIVE DATA block when you reference news.
- Use the live data + web search to explain the "why" — be specific, not generic.
- Separate "good company" from "good stock price today." Price targets only as ranges, flagged as estimates. Always name the biggest risk. Frame trades as considerations.
- End substantive financial analysis with: "Educational analysis, not financial advice." (App-navigation/teaching answers don't need the disclaimer.)`;
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

  // Fetch live quotes + news for tickers in the question, append to the system.
  const liveData = await gatherLiveData(messages, ctx);
  const system = buildSystem(ctx) + liveData;
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
        body: JSON.stringify({
          model,
          max_tokens: 1500,
          stream: true,
          system,
          messages: toAnthropicMessages(recent),
          // Let Claude search the web for current info during chat.
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
        }),
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
  const gem = await streamGemini({ system, messages: recent, webSearch: true });
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
