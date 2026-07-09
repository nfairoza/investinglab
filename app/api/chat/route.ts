import { NextRequest, NextResponse } from "next/server";
import { resolveApiKey } from "@/lib/ai/anthropic";
import { streamGemini, geminiKey } from "@/lib/ai/gemini";
import { planRoute } from "@/lib/ai/router";
import { logAiUsage, approxTokens } from "@/lib/ai/usage";
import { getUserClient } from "@/lib/supabase-data";
import { guardAiRate } from "@/lib/rate-limit";
import { toolSchemasFor, executeTool, type ToolContext } from "@/lib/chat/tools";
import { buildChatSystem, type ChatContext } from "@/lib/chat/system";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // the tool loop can take several model round-trips

interface ChatImage { mediaType: string; data: string }
interface ChatMessage { role: "user" | "assistant"; content: string; images?: ChatImage[] }

const MAX_TOOL_ITERS = 5;

// Anthropic message content: text + optional image blocks (vision preserved).
function toAnthropicMessages(msgs: ChatMessage[]): any[] {
  return msgs.map((m) => {
    if (m.images?.length) {
      const blocks: any[] = m.images.map((img) => ({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } }));
      if (m.content.trim()) blocks.push({ type: "text", text: m.content });
      return { role: m.role, content: blocks };
    }
    return { role: m.role, content: m.content };
  });
}

function aiErrorMessage(isAdmin: boolean, rawDetail: string): string {
  return isAdmin ? rawDetail : "Rukmani is temporarily unavailable. Please try again in a moment.";
}

// Read the user's remembered facts (C5) for the system prompt.
async function readMemory(supabase: any): Promise<{ fact: string; kind: string }[]> {
  try {
    const { data } = await supabase.from("chat_memory").select("fact, kind").order("updated_at", { ascending: false }).limit(40);
    return data ?? [];
  } catch { return []; }
}

// Human label for a tool-status line the widget shows while a tool runs.
function toolStatusLabel(name: string): string {
  const map: Record<string, string> = {
    search_transactions: "Searching transactions…", get_holdings: "Checking your holdings…",
    get_accounts_summary: "Pulling account balances…", get_networth_history: "Loading net-worth history…",
    get_watchlist_quotes: "Fetching watchlist quotes…", get_quote: "Getting a live quote…",
    get_price_history: "Loading price history…", get_news: "Reading the latest news…",
    get_market_brief: "Checking today's market…", get_recurring_charges: "Reviewing subscriptions…",
    remember_fact: "Noting that…", forget_fact: "Forgetting that…",
    get_platform_stats: "Pulling platform stats…", get_ai_costs: "Tallying AI costs…",
    get_error_log: "Reading the error log…", get_provider_health: "Checking provider health…",
    lookup_user: "Looking up the account…",
  };
  return map[name] ?? "Working…";
}

export async function POST(req: NextRequest) {
  const key = resolveApiKey();
  if (!key && !geminiKey()) {
    return NextResponse.json({ error: "no_key", message: "No AI key configured. Add a Claude or Gemini key." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const messages: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];
  const clientCtx: ChatContext = body?.context ?? { holdings: [], watchlist: [], currentPage: "/" };
  const session = await getUserClient();
  clientCtx.isAdmin = Boolean(session?.isAdmin);
  if (!messages.length) return NextResponse.json({ error: "messages required" }, { status: 400 });

  if (session) {
    const limited = await guardAiRate({ userId: session.userId, isAdmin: session.isAdmin }, "chat");
    if (limited) return limited;
  }

  const memory = session ? await readMemory(session.supabase) : [];
  const system = buildChatSystem(clientCtx, memory);
  const recent = messages.slice(-12);
  const lastUser = [...recent].reverse().find((m) => m.role === "user");
  const hasImage = Boolean(lastUser?.images?.length);
  const plan = planRoute("chat-analysis"); // tool-use always uses the analysis tier
  const claudeLeads = plan.primary === "claude" && Boolean(key);

  const toolCtx: ToolContext | null = session ? { supabase: session.supabase, userId: session.userId, isAdmin: session.isAdmin } : null;
  const tools = toolCtx ? toolSchemasFor(session!.isAdmin) : [];

  const encoder = new TextEncoder();
  const emitText = (c: ReadableStreamDefaultController, text: string) =>
    c.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text } })}\n\n`));
  const emitStatus = (c: ReadableStreamDefaultController, label: string) =>
    c.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "tool_status", label })}\n\n`));

  // ── Claude agentic streaming loop ──
  if (claudeLeads && toolCtx) {
    const stream = new ReadableStream({
      async start(controller) {
        const convo: any[] = toAnthropicMessages(recent);
        let inTok = 0, outTok = 0;
        try {
          for (let iter = 0; iter < MAX_TOOL_ITERS; iter++) {
            const { textDeltas, toolUses, usage, stopReason } = await streamClaudeTurn({
              key: key!, model: plan.claudeModel, system, messages: convo,
              tools: [...tools, { type: "web_search_20250305", name: "web_search", max_uses: 3 } as any],
              onText: (t) => emitText(controller, t),
            });
            inTok += usage.input; outTok += usage.output;

            if (stopReason !== "tool_use" || toolUses.length === 0) break; // final answer streamed

            // Append the assistant turn (text + tool_use blocks) then execute.
            const assistantBlocks: any[] = [];
            if (textDeltas) assistantBlocks.push({ type: "text", text: textDeltas });
            for (const tu of toolUses) assistantBlocks.push({ type: "tool_use", id: tu.id, name: tu.name, input: tu.input });
            convo.push({ role: "assistant", content: assistantBlocks });

            const results: any[] = [];
            for (const tu of toolUses) {
              if (tu.name === "web_search") continue; // server tool, handled by Anthropic
              emitStatus(controller, toolStatusLabel(tu.name));
              const result = await executeTool(tu.name, tu.input, toolCtx);
              results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(result) });
            }
            if (!results.length) break;
            convo.push({ role: "user", content: results });
          }
        } catch (e) {
          emitText(controller, "\n\n" + aiErrorMessage(clientCtx.isAdmin ?? false, e instanceof Error ? e.message : "chat failed"));
        } finally {
          void logAiUsage({ task: "chat-analysis", provider: "claude", model: plan.claudeModel, inputTokens: inTok, outputTokens: outTok, latencyMs: 0, ok: true, userId: session?.userId ?? null, estimated: false });
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "x-ai-model": plan.claudeModel } });
  }

  // ── Gemini fallback: no tool loop (keeps the fallback simple + robust); streams
  // the answer with the money/market context the tools would have provided folded
  // into the system prompt is out of scope here, so it answers from the page
  // context + web grounding. This path only runs when Claude is unavailable. ──
  const gem = await streamGemini({ system, messages: recent, webSearch: true, model: plan.geminiModel });
  if (!gem.ok || !gem.body) {
    const detail = await gem.text().catch(() => "");
    return NextResponse.json({ error: "ai_error", message: aiErrorMessage(clientCtx.isAdmin ?? false, `Gemini error ${gem.status}: ${detail.slice(0, 200)}`) }, { status: 502 });
  }
  const reader = gem.body.getReader();
  const decoder = new TextDecoder();
  const out = new ReadableStream({
    async start(controller) {
      let buf = "", outText = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n"); buf = lines.pop() ?? "";
          for (const line of lines) {
            const s = line.trim();
            if (!s.startsWith("data:")) continue;
            const json = s.slice(5).trim();
            if (!json || json === "[DONE]") continue;
            try {
              const obj = JSON.parse(json);
              const t = obj?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
              if (t) { outText += t; emitText(controller, t); }
            } catch { /* skip partial */ }
          }
        }
      } finally {
        void logAiUsage({ task: "chat-analysis", provider: "gemini", model: plan.geminiModel, inputTokens: approxTokens(system + recent.map((m) => m.content).join("\n")), outputTokens: approxTokens(outText), latencyMs: 0, ok: true, userId: session?.userId ?? null, estimated: true });
        controller.close();
      }
    },
  });
  return new Response(out, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "x-ai-model": plan.geminiModel } });
}

// ── One streaming Claude turn: streams text deltas out via onText, collects any
// tool_use blocks (accumulating their input JSON), returns usage + stop reason. ──
interface ToolUseCall { id: string; name: string; input: any }
async function streamClaudeTurn(opts: {
  key: string; model: string; system: string; messages: any[]; tools: any[];
  onText: (t: string) => void;
}): Promise<{ textDeltas: string; toolUses: ToolUseCall[]; usage: { input: number; output: number }; stopReason: string }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": opts.key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: opts.model, max_tokens: 1500, stream: true, system: opts.system, messages: opts.messages, tools: opts.tools }),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Anthropic HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "", textDeltas = "", stopReason = "end_turn";
  const usage = { input: 0, output: 0 };
  // Track content blocks by index to assemble tool_use input JSON.
  const blocks = new Map<number, { type: string; id?: string; name?: string; json: string }>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop() ?? "";
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith("data:")) continue;
      const json = s.slice(5).trim();
      if (!json || json === "[DONE]") continue;
      let ev: any; try { ev = JSON.parse(json); } catch { continue; }
      switch (ev.type) {
        case "message_start": usage.input += ev.message?.usage?.input_tokens ?? 0; break;
        case "content_block_start":
          blocks.set(ev.index, { type: ev.content_block?.type, id: ev.content_block?.id, name: ev.content_block?.name, json: "" });
          break;
        case "content_block_delta":
          if (ev.delta?.type === "text_delta" && ev.delta.text) { textDeltas += ev.delta.text; opts.onText(ev.delta.text); }
          else if (ev.delta?.type === "input_json_delta") { const b = blocks.get(ev.index); if (b) b.json += ev.delta.partial_json ?? ""; }
          break;
        case "message_delta":
          if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
          usage.output += ev.usage?.output_tokens ?? 0;
          break;
      }
    }
  }

  const toolUses: ToolUseCall[] = [];
  for (const b of blocks.values()) {
    if (b.type === "tool_use" && b.id && b.name) {
      let input: any = {}; try { input = b.json ? JSON.parse(b.json) : {}; } catch { input = {}; }
      toolUses.push({ id: b.id, name: b.name, input });
    }
  }
  return { textDeltas, toolUses, usage, stopReason };
}
