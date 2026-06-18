// Gemini (Google AI Studio) client — used as the AI provider when Anthropic is
// unreachable (e.g. AMD's network blocks api.anthropic.com). The key is the same
// GEMINI_API_KEY used for image generation.

export function geminiKey(): string | null {
  return process.env.GEMINI_API_KEY || null;
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-flash-latest";
}

// Default Gemini models for the smart router. "Pro" = big-context/structured
// heavy jobs; "Flash" = fast/cheap casual chat. Overridable via env.
export function geminiProModel(): string {
  return process.env.GEMINI_PRO_MODEL || "gemini-2.5-pro";
}
export function geminiFlashModel(): string {
  return process.env.GEMINI_FLASH_MODEL || "gemini-flash-latest";
}

// Non-streaming text generation. Returns concatenated text.
export async function callGemini(opts: {
  system: string;
  user: string;
  webSearch?: boolean;
  model?: string;
}): Promise<string> {
  const key = geminiKey();
  if (!key) throw new Error("No GEMINI_API_KEY configured");

  const body: any = {
    contents: [{ role: "user", parts: [{ text: opts.user }] }],
    systemInstruction: { parts: [{ text: opts.system }] },
  };
  // Gemini grounding (web search) — Google's equivalent of Claude web_search.
  if (opts.webSearch) body.tools = [{ google_search: {} }];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${opts.model || geminiModel()}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": key },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return (json.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("");
}

// Streaming text generation (SSE) — used by the chat widget.
// Returns the upstream Response whose body streams Gemini SSE chunks.
export async function streamGemini(opts: {
  system: string;
  messages: { role: "user" | "assistant"; content: string; images?: { mediaType: string; data: string }[] }[];
  webSearch?: boolean;
  model?: string;
}): Promise<Response> {
  const key = geminiKey();
  if (!key) throw new Error("No GEMINI_API_KEY configured");

  const contents = opts.messages.map((m) => {
    const parts: any[] = [];
    for (const img of m.images ?? []) {
      parts.push({ inlineData: { mimeType: img.mediaType, data: img.data } });
    }
    if (m.content.trim() || parts.length === 0) parts.push({ text: m.content });
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });

  const body: any = {
    contents,
    systemInstruction: { parts: [{ text: opts.system }] },
  };
  if (opts.webSearch) body.tools = [{ google_search: {} }];

  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${opts.model || geminiModel()}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": key },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
}
