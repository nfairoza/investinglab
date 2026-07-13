import { describe, it, expect } from "vitest";
import { computeCommitteeOverlap, committeeChipLabel } from "@/lib/power-trades/committee-jurisdictions";

describe("computeCommitteeOverlap", () => {
  it("flags an Armed Services member trading a defense name", () => {
    const o = computeCommitteeOverlap(
      [{ name: "Senate Committee on Armed Services" }],
      "Industrials", "Aerospace & Defense",
    );
    expect(o.overlap).toBe(true);
    expect(o.level).toBe("primary");
    expect(o.committee).toBe("Senate Committee on Armed Services");
    expect(o.sector).toBe("Defense");
  });

  it("does NOT flag an Armed Services member trading a pharma name", () => {
    const o = computeCommitteeOverlap(
      [{ name: "Senate Committee on Armed Services" }],
      "Healthcare", "Drug Manufacturers",
    );
    expect(o.overlap).toBe(false);
    expect(o.level).toBe("none");
  });

  it("flags Financial Services on a bank trade", () => {
    const o = computeCommitteeOverlap([{ name: "House Committee on Financial Services" }], "Financial Services", "Banks");
    expect(o.overlap).toBe(true);
    expect(o.sector).toBe("Financials");
  });

  it("returns secondary for Appropriations (broad macro influence)", () => {
    const o = computeCommitteeOverlap([{ name: "Senate Committee on Appropriations" }], "Technology", "Software");
    expect(o.overlap).toBe(true);
    expect(o.level).toBe("secondary");
  });

  it("no committees → no overlap", () => {
    expect(computeCommitteeOverlap([], "Energy").overlap).toBe(false);
  });
});

describe("committeeChipLabel", () => {
  it("strips the chamber + 'Committee on' boilerplate", () => {
    expect(committeeChipLabel("Senate Committee on Armed Services")).toBe("Armed Services");
    expect(committeeChipLabel("House Committee on Financial Services")).toBe("Financial Services");
    expect(committeeChipLabel("House Permanent Select Committee on Intelligence")).toBe("Intelligence");
  });
  it("handles null / plain names", () => {
    expect(committeeChipLabel(null)).toBe("");
    expect(committeeChipLabel("Ways and Means")).toBe("Ways and Means");
  });
});
