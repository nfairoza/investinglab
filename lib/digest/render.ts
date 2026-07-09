import type { DigestData } from "./assemble";

// F2 — dark-brand digest email template. Pure string builder (testable). The
// unsubscribe link is always present. Money formatting happens HERE (the digest
// isn't AI-narrated, so numerals are fine).
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${money(Math.abs(n))}`;

export function renderDigestHtml(d: DigestData, opts: { firstName?: string; unsubscribeUrl: string; appUrl: string }): string {
  const rows: string[] = [];

  if (d.netWorth != null) {
    const delta = d.netWorthDeltaWeek != null
      ? `<span style="color:${d.netWorthDeltaWeek >= 0 ? "#16D27E" : "#FB7185"}">${signed(d.netWorthDeltaWeek)}</span> since last snapshot`
      : "";
    rows.push(section("Net worth", `<div style="font-size:28px;font-weight:700;color:#F7F8FA">${money(d.netWorth)}</div><div style="color:#A9B2BD;font-size:13px;margin-top:2px">${delta}</div>`));
  }
  if (d.movers.length) {
    const items = d.movers.map((m) => `<div style="margin:4px 0"><b style="color:#F7F8FA">${m.symbol}</b> <span style="color:${m.changePct >= 0 ? "#16D27E" : "#FB7185"}">${m.changePct >= 0 ? "+" : ""}${m.changePct.toFixed(1)}%</span> <span style="color:#A9B2BD">— ${escapeHtml(m.reason)}</span></div>`).join("");
    rows.push(section("Top movers this week", items));
  }
  if (d.filings.length) {
    const items = d.filings.map((f) => `<div style="margin:4px 0"><b style="color:#F7F8FA">${escapeHtml(f.personName)}</b> <span style="color:#A9B2BD">${escapeHtml(f.summary)}</span></div>`).join("");
    rows.push(section("People you follow", items));
  }
  if (d.insight) rows.push(section("Rukmani says", `<div style="color:#D6DBE1">${escapeHtml(d.insight)}</div>`));

  return `<!doctype html><html><body style="margin:0;background:#0A0C0F;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:24px">
      <div style="font-size:22px;font-weight:800;letter-spacing:-1px;padding:8px 0"><span style="color:#F7F8FA">ruk</span><span style="color:#16D27E">Money</span></div>
      <div style="color:#A9B2BD;font-size:14px;margin-bottom:16px">Your week in review${opts.firstName ? `, ${escapeHtml(opts.firstName)}` : ""}.</div>
      ${rows.join("")}
      <a href="${opts.appUrl}" style="display:inline-block;margin-top:16px;background:#16D27E;color:#0A0C0F;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:8px">Open rukMoney</a>
      <div style="color:#5B6673;font-size:11px;margin-top:24px;line-height:1.6">
        You're receiving this because you opted into the weekly digest. Research & education, not financial advice.<br/>
        <a href="${opts.unsubscribeUrl}" style="color:#5B6673;text-decoration:underline">Unsubscribe</a>
      </div>
    </div></body></html>`;
}

export function renderDigestText(d: DigestData): string {
  const lines = ["rukMoney — your week in review", ""];
  if (d.netWorth != null) lines.push(`Net worth: ${money(d.netWorth)}${d.netWorthDeltaWeek != null ? ` (${signed(d.netWorthDeltaWeek)})` : ""}`);
  if (d.movers.length) { lines.push("", "Top movers:"); d.movers.forEach((m) => lines.push(`  ${m.symbol} ${m.changePct >= 0 ? "+" : ""}${m.changePct.toFixed(1)}% — ${m.reason}`)); }
  if (d.filings.length) { lines.push("", "People you follow:"); d.filings.forEach((f) => lines.push(`  ${f.personName}: ${f.summary}`)); }
  if (d.insight) { lines.push("", `Rukmani says: ${d.insight}`); }
  return lines.join("\n");
}

function section(title: string, inner: string): string {
  return `<div style="background:#12151A;border:1px solid #1E242C;border-radius:12px;padding:16px;margin-bottom:12px">
    <div style="color:#8A93A0;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">${title}</div>${inner}</div>`;
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
