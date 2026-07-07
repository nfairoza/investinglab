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

// Split a markdown table row into trimmed cell strings, tolerating optional
// leading/trailing pipes: "| a | b |" → ["a","b"].
function splitTableRow(line: string): string[] {
  let l = line.trim();
  if (l.startsWith("|")) l = l.slice(1);
  if (l.endsWith("|")) l = l.slice(0, -1);
  return l.split("|").map((c) => c.trim());
}

// Is this the |:---|:--:|---:| separator row that defines a GFM table?
function isSeparatorRow(line: string): boolean {
  if (!line.includes("-")) return false;
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c));
}

function cellAlign(sep: string): string {
  const c = sep.trim();
  const left = c.startsWith(":");
  const right = c.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  return "left";
}

// Find GFM pipe tables (header row + separator row + body rows) and replace them
// with a horizontally-scrollable HTML <table>. Inline formatting inside cells has
// already been applied by the time this runs, so cells keep links/bold/etc.
function renderTables(src: string): string {
  const lines = src.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const header = lines[i];
    const sep = lines[i + 1];
    if (header != null && header.includes("|") && sep != null && isSeparatorRow(sep)) {
      const headCells = splitTableRow(header);
      const aligns = splitTableRow(sep).map(cellAlign);
      const bodyRows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].includes("|") && lines[j].trim() !== "") {
        bodyRows.push(splitTableRow(lines[j]));
        j++;
      }
      const align = (n: number) => aligns[n] ?? "left";
      const thead = `<thead><tr>${headCells.map((c, n) => `<th style="text-align:${align(n)}">${c}</th>`).join("")}</tr></thead>`;
      const tbody = `<tbody>${bodyRows
        .map((r) => `<tr>${r.map((c, n) => `<td style="text-align:${align(n)}">${c}</td>`).join("")}</tr>`)
        .join("")}</tbody>`;
      out.push(`<div class="chat-table-wrap"><table class="chat-table">${thead}${tbody}</table></div>`);
      i = j;
    } else {
      out.push(header);
      i++;
    }
  }
  return out.join("\n");
}

export function renderMarkdown(src: string): string {
  if (!src) return "";
  let s = escapeHtml(src);

  // Fenced code blocks ```...```
  s = s.replace(/```([\s\S]*?)```/g, (_m, code) =>
    `<pre class="my-2 overflow-x-auto rounded-lg bg-black/40 p-2 text-[12px] text-ink"><code>${code.trim()}</code></pre>`);

  // Inline code `x`
  s = s.replace(/`([^`]+)`/g, '<code class="rounded bg-black/40 px-1 text-[12px] text-brand-200">$1</code>');

  // Markdown links [text](url)
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer" class="text-brand-300 underline underline-offset-2 hover:text-brand-200 break-words">$1</a>');

  // Internal/relative links [text](/path) — same-tab navigation within the app
  // (e.g. [June 1 — $4,145.17](/transactions?txn=abc) jumps to that transaction).
  // Note: query separators arrive HTML-escaped (&amp;), which is valid in href.
  s = s.replace(/\[([^\]]+)\]\((\/[^\s)]+)\)/g,
    '<a href="$2" class="text-brand-300 underline underline-offset-2 hover:text-brand-200 break-words">$1</a>');

  // Bare URLs → links (avoid double-linking ones already in href="...")
  s = s.replace(/(^|[^"=>])(https?:\/\/[^\s<)]+)/g,
    '$1<a href="$2" target="_blank" rel="noreferrer" class="text-brand-300 underline underline-offset-2 hover:text-brand-200 break-words">$2</a>');

  // Bold **x** and italic *x*
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-ink">$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

  // Headings ## / ###
  s = s.replace(/^###\s+(.+)$/gm, '<div class="mt-2 font-semibold text-ink">$1</div>');
  s = s.replace(/^##\s+(.+)$/gm, '<div class="mt-2 text-[15px] font-semibold text-ink">$1</div>');

  // GFM pipe tables → scrollable <table> (must run before the list/newline rules
  // below, which would otherwise mangle the pipe rows into a wall of text).
  s = renderTables(s);

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
