import { describe, it, expect } from "vitest";
import { buildSankey, toFlowList, merchantRowsFor, type SankeyTxn, type SankeyIncomeStream } from "@/lib/money/sankey";

const streams: SankeyIncomeStream[] = [
  { source: "ACME PAYROLL", matchKey: "acme payroll" },
];

const t = (over: Partial<SankeyTxn>): SankeyTxn => ({
  transactionId: Math.random().toString(36).slice(2),
  date: "2026-07-10", merchant: null, name: "x", amount: 0,
  category: "Other", isTransfer: false, isIncome: false, ...over,
});

describe("buildSankey — honesty (transfers/CC payments excluded)", () => {
  it("a credit-card payment (flagged transfer) is NEVER a flow", () => {
    const txns: SankeyTxn[] = [
      t({ name: "ACME PAYROLL", merchant: "ACME PAYROLL", amount: -5000, isIncome: true }),
      t({ merchant: "Whole Foods", amount: 300, category: "Groceries" }),
      // The card PAYMENT from checking — flagged transfer. Must not appear.
      t({ merchant: "CHASE CREDIT CRD AUTOPAY", amount: 300, category: "Bills & Utilities", isTransfer: true }),
    ];
    const g = buildSankey(txns, streams, 4700);
    // No node or link references the autopay.
    const labels = g.nodes.map((n) => n.label).join("|");
    expect(labels).not.toContain("CHASE");
    // Spending is the $300 groceries swipe only — the payment didn't double it.
    expect(g.totalSpending).toBe(300);
    // Evidence never contains the transfer txn.
    const allEv = g.links.flatMap((l) => l.evidence.map((e) => e.label));
    expect(allEv.some((l) => l.includes("CHASE"))).toBe(false);
  });
});

describe("buildSankey — reconciliation", () => {
  it("income stream links + other income sum to total income", () => {
    const txns: SankeyTxn[] = [
      t({ merchant: "ACME PAYROLL", amount: -4000, isIncome: true }),
      t({ merchant: "ACME PAYROLL", amount: -1000, isIncome: true }),
      t({ merchant: "Etsy shop", amount: -250, isIncome: true }), // unmatched → other income
      t({ merchant: "Rent Co", amount: 1800, category: "Rent & Mortgage" }),
    ];
    const g = buildSankey(txns, streams, 3450);
    expect(g.totalIncome).toBe(5250);
    const incomeLinks = g.links.filter((l) => l.target === "total:income");
    expect(incomeLinks.reduce((s, l) => s + l.value, 0)).toBe(5250);
    // ACME aggregated to one stream node (5000), Etsy → other income (250).
    const acme = incomeLinks.find((l) => l.source === "income:ACME PAYROLL")!;
    expect(acme.value).toBe(5000);
    expect(incomeLinks.find((l) => l.source === "income:other")!.value).toBe(250);
  });

  it("each category's level-2 merchant links sum to the category total", () => {
    const txns: SankeyTxn[] = [
      t({ merchant: "ACME PAYROLL", amount: -5000, isIncome: true }),
      t({ merchant: "Whole Foods", amount: 200, category: "Groceries" }),
      t({ merchant: "Trader Joe's", amount: 150, category: "Groceries" }),
      t({ merchant: "Costco", amount: 120, category: "Groceries" }),
    ];
    const g = buildSankey(txns, streams, 4530);
    const catLink = g.links.find((l) => l.target === "cat:Groceries")!;
    expect(catLink.value).toBe(470);
    const merchLinks = g.links.filter((l) => l.source === "cat:Groceries");
    expect(merchLinks.reduce((s, l) => s + l.value, 0)).toBe(470); // reconciles exactly
  });

  it("caps merchants per category at 6, folding the rest into 'Other'", () => {
    const merchants = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const txns: SankeyTxn[] = [
      t({ merchant: "ACME PAYROLL", amount: -5000, isIncome: true }),
      ...merchants.map((m, i) => t({ merchant: m, amount: (i + 1) * 10, category: "Shopping" })),
    ];
    const g = buildSankey(txns, streams, 4640);
    const merchLinks = g.links.filter((l) => l.source === "cat:Shopping");
    expect(merchLinks.length).toBe(7); // 6 top + 1 "Other"
    const other = merchLinks.find((l) => g.nodes.find((n) => n.id === l.target)?.label === "Other")!;
    // A(10)+B(20) are the two smallest → folded. Other = 30.
    expect(other.value).toBe(30);
    // Still reconciles to the category total.
    const catTotal = g.links.find((l) => l.target === "cat:Shopping")!.value;
    expect(merchLinks.reduce((s, l) => s + l.value, 0)).toBe(catTotal);
  });

  it("savings band uses the ledger savings_flow + reports the rate; negative net = no band", () => {
    const txns: SankeyTxn[] = [
      t({ merchant: "ACME PAYROLL", amount: -5000, isIncome: true }),
      t({ merchant: "Rent Co", amount: 3300, category: "Rent & Mortgage" }),
    ];
    const g = buildSankey(txns, streams, 1700);
    expect(g.savings).toBe(1700);
    expect(g.savingsRate).toBe(0.34); // 1700/5000
    expect(g.links.some((l) => l.target === "savings")).toBe(true);

    const neg = buildSankey(txns, streams, -200);
    expect(neg.links.some((l) => l.target === "savings")).toBe(false);
  });

  it("every income link's evidence excludes non-income and transfer rows", () => {
    const txns: SankeyTxn[] = [
      t({ merchant: "ACME PAYROLL", amount: -5000, isIncome: true }),
      t({ merchant: "Refund", amount: -50, isTransfer: true }), // transfer deposit — excluded
      t({ merchant: "Store", amount: 100, category: "Shopping" }),
    ];
    const g = buildSankey(txns, streams, 4900);
    const incomeEv = g.links.filter((l) => l.target === "total:income").flatMap((l) => l.evidence);
    expect(incomeEv.every((e) => e.label !== "Refund")).toBe(true);
  });
});

describe("toFlowList — mobile list reconciles to Sankey + totals", () => {
  const txns: SankeyTxn[] = [
    t({ merchant: "ACME PAYROLL", amount: -4000, isIncome: true }),
    t({ merchant: "Side gig", amount: -1000, isIncome: true }),
    t({ merchant: "Rent Co", amount: 1800, category: "Rent & Mortgage" }),
    t({ merchant: "Whole Foods", amount: 200, category: "Groceries" }),
    t({ merchant: "Trader Joe's", amount: 150, category: "Groceries" }),
  ];
  const g = buildSankey(txns, streams, 2850);

  it("income rows sum to total income (= Sankey income links)", () => {
    const list = toFlowList(g, "category");
    const listIncome = list.income.reduce((s, r) => s + r.amount, 0);
    const sankeyIncome = g.links.filter((l) => l.target === "total:income").reduce((s, l) => s + l.value, 0);
    expect(listIncome).toBe(g.totalIncome);
    expect(listIncome).toBe(sankeyIncome);
  });

  it("expense category rows sum to total spending (= Sankey category links)", () => {
    const list = toFlowList(g, "category");
    const listSpend = list.expenses.reduce((s, r) => s + r.amount, 0);
    const sankeySpend = g.links.filter((l) => l.source === "total:income" && l.target.startsWith("cat:")).reduce((s, l) => s + l.value, 0);
    expect(listSpend).toBe(g.totalSpending);
    expect(listSpend).toBe(sankeySpend);
  });

  it("percentages are % of INCOME, not % of spending", () => {
    const list = toFlowList(g, "category");
    const rent = list.expenses.find((r) => r.category === "Rent & Mortgage")!;
    // 1800 / 5000 income = 36%, NOT 1800/2150 spending (84%).
    expect(rent.pctOfIncome).toBe(36);
  });

  it("merchant scope flattens + still reconciles to total spending", () => {
    const list = toFlowList(g, "merchant");
    expect(list.expenses.reduce((s, r) => s + r.amount, 0)).toBe(g.totalSpending);
  });

  it("merchant drill-down sums to its category total", () => {
    const rows = merchantRowsFor(g, "cat:Groceries");
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(350);
  });
});
