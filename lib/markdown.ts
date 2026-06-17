// Tiny, safe markdown → HTML for chat messages. No dependencies.
// Escapes HTML first (XSS-safe), then applies a small set of patterns:
// links, bold, italic, inline code, headings, bullet/numbered lists, line breaks.
// Returns an HTML string for use with dangerouslySetInnerHTML.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderMarkdown(src: string): string {
  if (!src) return "";
  let s = escapeHtml(src);

  // Fenced code blocks ```...```
  s = s.replace(/```([\s\S]*?)```/g, (_m, code) =>
    `<pre class="my-2 overflow-x-auto rounded-lg bg-black/40 p-2 text-[12px] text-slate-200"><code>${code.trim()}</code></pre>`);

  // Inline code `x`
  s = s.replace(/`([^`]+)`/g, '<code class="rounded bg-black/40 px-1 text-[12px] text-brand-200">$1</code>');

  // Markdown links [text](url)
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer" class="text-brand-300 underline underline-offset-2 hover:text-brand-200 break-words">$1</a>');

  // Bare URLs → links (avoid double-linking ones already in href="...")
  s = s.replace(/(^|[^"=>])(https?:\/\/[^\s<)]+)/g,
    '$1<a href="$2" target="_blank" rel="noreferrer" class="text-brand-300 underline underline-offset-2 hover:text-brand-200 break-words">$2</a>');

  // Bold **x** and italic *x*
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-slate-100">$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

  // Headings ## / ###
  s = s.replace(/^###\s+(.+)$/gm, '<div class="mt-2 font-semibold text-slate-100">$1</div>');
  s = s.replace(/^##\s+(.+)$/gm, '<div class="mt-2 text-[15px] font-semibold text-slate-100">$1</div>');

  // Bullet lists  - x  /  * x
  s = s.replace(/(?:^|\n)((?:[-*]\s+.+(?:\n|$))+)/g, (_m, block) => {
    const items = block.trim().split(/\n/).map((l: string) => l.replace(/^[-*]\s+/, "")).map((t: string) => `<li>${t}</li>`).join("");
    return `\n<ul class="my-1 list-disc space-y-0.5 pl-5">${items}</ul>`;
  });

  // Numbered lists 1. x
  s = s.replace(/(?:^|\n)((?:\d+\.\s+.+(?:\n|$))+)/g, (_m, block) => {
    const items = block.trim().split(/\n/).map((l: string) => l.replace(/^\d+\.\s+/, "")).map((t: string) => `<li>${t}</li>`).join("");
    return `\n<ol class="my-1 list-decimal space-y-0.5 pl-5">${items}</ol>`;
  });

  // Remaining newlines → <br> (but not right after block elements)
  s = s.replace(/\n{2,}/g, "<br/><br/>").replace(/\n/g, "<br/>");
  s = s.replace(/(<\/(?:ul|ol|pre|div)>)<br\/>/g, "$1");

  return s;
}
