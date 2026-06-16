// =============================================================================
// One source of truth for every financial term in the app.
// Both the <Term> hover/tap tooltip and the /glossary page read from here, so a
// term is defined exactly once and can never drift between the two places.
// Plain English first; "why it matters" second; a tiny concrete example third.
// =============================================================================

export interface GlossaryEntry {
  term: string;
  short: string; // what it means, in everyday language
  why: string; // why it matters to a decision
  example?: string; // a tiny concrete example
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  pe: {
    term: "P/E ratio",
    short: "How many dollars you pay for each $1 the company earns in a year.",
    why: "Lower can look cheaper, but cheap often means the market expects trouble.",
    example: "A P/E of 20 means you pay $20 for every $1 of annual profit.",
  },
  ev_ebitda: {
    term: "EV/EBITDA",
    short: "The company's total price (including its debt) versus its rough operating profit.",
    why: "Compares businesses with different debt loads more fairly than P/E does.",
    example: "An EV/EBITDA around 10–12 is mid-range for many mature companies.",
  },
  ev_sales: {
    term: "EV/Sales",
    short: "The company's total price versus its yearly revenue.",
    why: "Useful when a company isn't profitable yet, so P/E doesn't work.",
    example: "A fast grower might trade at 10x sales; a slow one at 2x.",
  },
  fcf: {
    term: "Free cash flow (FCF)",
    short: "Cash left over after running the business and buying the equipment it needs.",
    why: "It's the money truly available to pay down debt, buy back shares, or reinvest.",
    example: "Revenue can look great while FCF is negative — that's a warning sign.",
  },
  fcf_yield: {
    term: "FCF yield",
    short: "Free cash flow divided by the company's market value, shown as a percent.",
    why: "Like an interest rate the business 'pays' you in cash terms — higher is generally cheaper.",
    example: "A 5% FCF yield is roughly $5 of cash per $100 of stock value.",
  },
  dcf: {
    term: "DCF (discounted cash flow)",
    short: "Estimating a fair price by adding up future cash, discounted back to today's value.",
    why: "It forces you to be explicit about your growth and risk assumptions.",
    example: "Small changes in assumptions swing the answer a lot — treat it as a range, not a number.",
  },
  reverse_dcf: {
    term: "Reverse DCF",
    short: "Working backwards from today's price to see what growth it already assumes.",
    why: "Tells you whether the market's expectations are realistic or fantasy.",
    example: "If the price assumes 30% growth for 10 years, ask yourself: is that likely?",
  },
  rsi: {
    term: "RSI",
    short: "A 0–100 momentum gauge of how fast a price has been rising or falling.",
    why: "Very high (above ~70) can mean overbought; very low (below ~30) oversold — a hint, not a rule.",
    example: "An RSI of 80 after a big run can signal a near-term pause.",
  },
  moving_average: {
    term: "Moving average",
    short: "The average price over a recent window, like the last 50 or 200 days.",
    why: "Smooths out daily noise so you can see the underlying trend.",
    example: "A price above its 200-day average is often read as a healthier trend.",
  },
  support_resistance: {
    term: "Support / resistance",
    short: "Price areas where buying (a floor) or selling (a ceiling) has tended to cluster.",
    why: "Helps you frame sensible entry and exit zones.",
    example: "A stock that keeps bouncing off $90 is treating $90 as 'support'.",
  },
  margin: {
    term: "Margin",
    short: "The share of each sales dollar the company keeps as profit.",
    why: "Rising margins mean the business is getting more efficient or has pricing power.",
    example: "A 25% operating margin means 25 cents kept per $1 of sales.",
  },
  dilution: {
    term: "Dilution",
    short: "When a company issues new shares, shrinking each existing share's slice of the pie.",
    why: "Your ownership and per-share value can fall even while the business grows.",
    example: "Heavy stock-based pay can quietly dilute existing shareholders.",
  },
  market_cap: {
    term: "Market cap",
    short: "The total value of all a company's shares (share price × number of shares).",
    why: "A quick sense of company size and how richly it's priced.",
    example: "$50 price × 100M shares = a $5B market cap.",
  },
  enterprise_value: {
    term: "Enterprise value (EV)",
    short: "Market cap plus debt, minus cash — roughly the cost to buy the whole business.",
    why: "A fairer price tag when comparing companies with different debt levels.",
    example: "A debt-heavy company's EV is much larger than its market cap.",
  },
  rule_of_40: {
    term: "Rule of 40",
    short: "For software companies: growth % plus profit margin % should clear 40.",
    why: "A quick health check that balances growth against profitability.",
    example: "30% growth + 15% margin = 45, so it passes.",
  },
  stock_act: {
    term: "STOCK Act",
    short: "A 2012 law requiring members of Congress to publicly disclose their stock trades.",
    why: "It's why congressional trading data exists and is public at all.",
    example: "A senator who buys a stock must file a report the public can read.",
  },
  ptr: {
    term: "Periodic Transaction Report (PTR)",
    short: "The official form a member of Congress files to disclose a trade.",
    why: "Each PTR is the raw record these trackers are built from.",
    example: "One PTR can list several buys and sells from the same period.",
  },
  disclosure_window: {
    term: "Disclosure window",
    short: "The gap between when a trade happens and when it must be reported — up to 45 days.",
    why: "It means this data is always lagged; it's history, not a live position.",
    example: "A trade on the 1st might not show up publicly until weeks later.",
  },
};
