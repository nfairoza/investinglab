// =============================================================================
// Cash-flow Sankey builder. Pure + deterministic — turns the ledger's income
// streams + categorized spending + savings flow into nodes/links for d3-sankey.
//
// Shape (left → right):
//   income streams (+ "Other income")  →  Total income  →  { Savings, top
//   spending categories }  →  { top merchants per category, + "Other" }
//
// HONESTY: transfers and credit-card payments are EXCLUDED via the ledger's
// per-transaction flags (isTransfer). A card swipe is the spending that appears;
// the later card *payment* from checking is a transfer and never shows as a flow.
// Every link carries its evidence transactions so a band click can prove itself.
// Amounts reconcile exactly: income splits sum to total income; each category's
// level-2 links sum to that category's total.
// =============================================================================

export interface SankeyTxn {
  transactionId: string;
  date: string;            // YYYY-MM-DD
  merchant: string | null;
  name: string;
  amount: number;          // >0 = expense, <0 = deposit (Plaid convention)
  category: string;        // display category (from categorize())
  isTransfer: boolean;     // ledger flag — transfers/CC-payments excluded
  isIncome: boolean;       // ledger flag — a real income deposit
}

export interface SankeyIncomeStream {
  source: string;          // stream label (merchant/name)
  matchKey: string;        // lowercased key used to attribute deposits
}

export interface EvidenceTxn { transactionId: string; date: string; label: string; amount: number }

export interface SankeyNode {
  id: string;              // stable id
  label: string;
  kind: "income" | "total" | "savings" | "category" | "merchant";
  category?: string;       // for category/merchant nodes, the owning category
}
export interface SankeyLink {
  source: string;          // node id
  target: string;          // node id
  value: number;           // dollars (positive)
  evidence: EvidenceTxn[];
}
export interface SankeyGraph {
  nodes: SankeyNode[];
  links: SankeyLink[];
  totalIncome: number;
  totalSpending: number;
  savings: number;
  savingsRate: number;     // savings / income, 0..1
}

const MAX_CATEGORIES = 8;
const MAX_MERCHANTS_PER_CAT = 6;
const round2 = (n: number) => Math.round(n * 100) / 100;

function ev(t: SankeyTxn): EvidenceTxn {
  return { transactionId: t.transactionId, date: t.date, label: t.merchant || t.name || "—", amount: round2(Math.abs(t.amount)) };
}

/**
 * Build the Sankey graph for a set of ledger transactions over a period.
 * `savingsFlow` is the ledger's authoritative net (income − outflow) for the
 * period, so the Savings band reconciles with the Money dashboard.
 */
export function buildSankey(
  txns: SankeyTxn[],
  streams: SankeyIncomeStream[],
  savingsFlow: number,
): SankeyGraph {
  // Non-transfer only — the transfer/CC-payment exclusion happens HERE.
  const clean = txns.filter((t) => !t.isTransfer);

  // ---- Income side ----
  const deposits = clean.filter((t) => t.isIncome && t.amount < 0);
  const streamKeys = streams.map((s) => ({ ...s, key: s.matchKey.toLowerCase() }));
  const incomeByStream = new Map<string, { total: number; evidence: EvidenceTxn[] }>();
  let otherIncome = 0; const otherIncomeEv: EvidenceTxn[] = [];
  for (const t of deposits) {
    const amt = -t.amount; // deposits are negative → positive dollars
    const mkey = (t.merchant || t.name || "").toLowerCase();
    const matched = streamKeys.find((s) => mkey.includes(s.key) || s.key.includes(mkey));
    if (matched) {
      const cur = incomeByStream.get(matched.source) ?? { total: 0, evidence: [] };
      cur.total += amt; cur.evidence.push(ev(t)); incomeByStream.set(matched.source, cur);
    } else {
      otherIncome += amt; otherIncomeEv.push(ev(t));
    }
  }
  const totalIncome = round2([...incomeByStream.values()].reduce((s, v) => s + v.total, 0) + otherIncome);

  // ---- Spending side ----
  const spend = clean.filter((t) => !t.isIncome && t.amount > 0);
  const byCat = new Map<string, { total: number; byMerchant: Map<string, { total: number; evidence: EvidenceTxn[] }> }>();
  for (const t of spend) {
    const cat = t.category || "Other";
    const c = byCat.get(cat) ?? { total: 0, byMerchant: new Map() };
    c.total += t.amount;
    const mk = t.merchant || t.name || "Other";
    const m = c.byMerchant.get(mk) ?? { total: 0, evidence: [] };
    m.total += t.amount; m.evidence.push(ev(t)); c.byMerchant.set(mk, m);
    byCat.set(cat, c);
  }
  const totalSpending = round2([...byCat.values()].reduce((s, c) => s + c.total, 0));
  const savings = round2(savingsFlow);
  const savingsRate = totalIncome > 0 ? savings / totalIncome : 0;

  // ---- Assemble nodes + links ----
  const nodes: SankeyNode[] = [];
  const links: SankeyLink[] = [];
  const TOTAL = "total:income";
  nodes.push({ id: TOTAL, label: "Income", kind: "total" });

  // Income streams → total.
  for (const [source, v] of incomeByStream) {
    const id = `income:${source}`;
    nodes.push({ id, label: source, kind: "income" });
    links.push({ source: id, target: TOTAL, value: round2(v.total), evidence: v.evidence });
  }
  if (otherIncome > 0) {
    nodes.push({ id: "income:other", label: "Other income", kind: "income" });
    links.push({ source: "income:other", target: TOTAL, value: round2(otherIncome), evidence: otherIncomeEv });
  }

  // Total → Savings (positive net only; a negative month has no savings band).
  if (savings > 0) {
    nodes.push({ id: "savings", label: "Savings", kind: "savings" });
    links.push({ source: TOTAL, target: "savings", value: savings, evidence: [] });
  }

  // Total → top categories (rest folded into "Other spending").
  const cats = [...byCat.entries()].map(([category, c]) => ({ category, ...c })).sort((a, b) => b.total - a.total);
  const topCats = cats.slice(0, MAX_CATEGORIES);
  const restCats = cats.slice(MAX_CATEGORIES);
  for (const c of topCats) {
    const catId = `cat:${c.category}`;
    nodes.push({ id: catId, label: c.category, kind: "category", category: c.category });
    links.push({ source: TOTAL, target: catId, value: round2(c.total), evidence: catEvidence(c.byMerchant) });

    // Category → top merchants (cap, rest = "Other").
    const merchants = [...c.byMerchant.entries()].map(([m, v]) => ({ merchant: m, ...v })).sort((a, b) => b.total - a.total);
    const topM = merchants.slice(0, MAX_MERCHANTS_PER_CAT);
    const restM = merchants.slice(MAX_MERCHANTS_PER_CAT);
    for (const m of topM) {
      const mId = `merchant:${c.category}:${m.merchant}`;
      nodes.push({ id: mId, label: m.merchant, kind: "merchant", category: c.category });
      links.push({ source: catId, target: mId, value: round2(m.total), evidence: m.evidence });
    }
    if (restM.length) {
      const otherTotal = round2(restM.reduce((s, m) => s + m.total, 0));
      const otherEv = restM.flatMap((m) => m.evidence);
      const mId = `merchant:${c.category}:__other`;
      nodes.push({ id: mId, label: "Other", kind: "merchant", category: c.category });
      links.push({ source: catId, target: mId, value: otherTotal, evidence: otherEv });
    }
  }
  if (restCats.length) {
    const otherTotal = round2(restCats.reduce((s, c) => s + c.total, 0));
    const otherEv = restCats.flatMap((c) => catEvidence(c.byMerchant));
    nodes.push({ id: "cat:__other", label: "Other spending", kind: "category", category: "Other spending" });
    links.push({ source: TOTAL, target: "cat:__other", value: otherTotal, evidence: otherEv });
  }

  return { nodes, links, totalIncome, totalSpending, savings, savingsRate: round2(savingsRate) };
}

function catEvidence(byMerchant: Map<string, { total: number; evidence: EvidenceTxn[] }>): EvidenceTxn[] {
  const all: EvidenceTxn[] = [];
  for (const v of byMerchant.values()) all.push(...v.evidence);
  return all;
}
