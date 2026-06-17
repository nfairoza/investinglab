"use client";

import useSWR from "swr";

// Animated "AI is working" indicator that brands itself to whichever provider
// will actually answer. We infer the provider from /api/ai/status (the resolved
// model name): a "gemini*" model → Gemini, otherwise Claude. Falls back to a
// neutral spinner while status loads.

type Provider = "claude" | "gemini" | "unknown";

function providerFromModel(model?: string): Provider {
  if (!model) return "unknown";
  if (/gemini/i.test(model)) return "gemini";
  if (/claude/i.test(model)) return "claude";
  return "unknown";
}

// Anthropic-style burst mark (clay/orange), gently spinning.
function ClaudeMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden style={{ animation: "ai-spin 2.4s linear infinite" }}>
      {[0, 45, 90, 135].map((deg) => (
        <rect key={deg} x="11" y="2" width="2" height="20" rx="1" fill="#D97757" transform={`rotate(${deg} 12 12)`} opacity={0.9} />
      ))}
      <circle cx="12" cy="12" r="2.4" fill="#D97757" />
    </svg>
  );
}

// Gemini-style four-point sparkle (blue→violet), pulsing.
function GeminiMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden style={{ animation: "ai-pulse 1.4s ease-in-out infinite" }}>
      <defs>
        <linearGradient id="gmini" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4796E3" />
          <stop offset="100%" stopColor="#9168C0" />
        </linearGradient>
      </defs>
      <path d="M12 2 C12.6 7.4 16.6 11.4 22 12 C16.6 12.6 12.6 16.6 12 22 C11.4 16.6 7.4 12.6 2 12 C7.4 11.4 11.4 7.4 12 2 Z" fill="url(#gmini)" />
    </svg>
  );
}

// Three bouncing dots, tinted to the provider color.
function Dots({ color }: { color: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: color, animation: "ai-bounce 1s ease-in-out infinite", animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </span>
  );
}

export function AiThinking({ label, className = "" }: { label?: string; className?: string }) {
  const { data } = useSWR<{ model?: string }>("/api/ai/status", (u: string) => fetch(u).then((r) => r.json()), {
    revalidateOnFocus: false,
  });
  const provider = providerFromModel(data?.model);

  const name = provider === "gemini" ? "Gemini" : "Claude";
  const color = provider === "gemini" ? "#7aa7e6" : "#D97757";
  const text = label ?? `${name} is pulling live data and searching recent news…`;

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {provider === "gemini" ? <GeminiMark /> : <ClaudeMark />}
      <span className="text-xs text-slate-400">{text}</span>
      <Dots color={color} />
    </div>
  );
}
