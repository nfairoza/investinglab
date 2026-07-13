import { describe, it, expect } from "vitest";
import { renderAlertEmailHtml, renderAlertEmailText, alertEmailSubject, type AlertEmailItem } from "@/lib/alerts/email";

const one: AlertEmailItem[] = [{ title: "AAPL alert", body: "crossed above $200" }];
const many: AlertEmailItem[] = [
  { title: "AAPL alert", body: "crossed above $200" },
  { title: "TSLA alert", body: "down 6% today" },
  { title: "NVDA alert", body: "crossed below $120" },
];

describe("alert email render", () => {
  it("critical subject leads with a warning + the alert title", () => {
    expect(alertEmailSubject(one, { critical: true })).toContain("AAPL alert");
    expect(alertEmailSubject(one, { critical: true }).startsWith("⚠")).toBe(true);
  });

  it("missed-alert subject is singular vs. counted", () => {
    expect(alertEmailSubject(one, { critical: false })).toBe("You may have missed: AAPL alert");
    expect(alertEmailSubject(many, { critical: false })).toBe("3 alerts you may have missed");
  });

  it("HTML lists every item + the brand shell", () => {
    const html = renderAlertEmailHtml(many, { critical: false });
    expect(html).toContain("ruk");
    expect(html).toContain("AAPL alert");
    expect(html).toContain("TSLA alert");
    expect(html).toContain("NVDA alert");
    // Missed-alert emails mention the settings opt-out.
    expect(html).toContain("Settings");
  });

  it("critical HTML frames it as a critical alert, not a missed-alert digest", () => {
    const html = renderAlertEmailHtml(one, { critical: true });
    expect(html).toContain("critical");
    expect(html).not.toContain("may have missed");
  });

  it("escapes HTML in titles/bodies", () => {
    const html = renderAlertEmailHtml([{ title: "<script>x</script>", body: "a & b" }], { critical: false });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("a &amp; b");
  });

  it("text version lists items + the alerts link", () => {
    const text = renderAlertEmailText(many, { critical: false });
    expect(text).toContain("AAPL alert");
    expect(text).toContain("/alerts");
  });
});
