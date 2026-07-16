import { describe, it, expect } from "vitest";
import { categoryStyle, categorySlug, categoryFromSlug, CATEGORY_STYLE } from "@/lib/categories";
import { DISPLAY_CATEGORIES } from "@/lib/money/categorize";

describe("category icon map", () => {
  it("every display category has a style (icon + accent)", () => {
    for (const c of DISPLAY_CATEGORIES) {
      const s = categoryStyle(c);
      expect(s.icon).toBeTruthy();
      expect(s.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
  it("an unknown category falls back to the neutral style", () => {
    const s = categoryStyle("Nonexistent");
    expect(s.icon).toBe(CATEGORY_STYLE.Other.icon);
  });
});

describe("categorySlug is reversible", () => {
  it("slug ↔ category round-trips for every display category", () => {
    for (const c of DISPLAY_CATEGORIES) {
      const slug = categorySlug(c);
      expect(slug).toMatch(/^[a-z0-9-]+$/);
      expect(categoryFromSlug(slug)).toBe(c);
    }
  });
  it("handles ampersands", () => {
    expect(categorySlug("Food & Dining")).toBe("food-and-dining");
    expect(categoryFromSlug("food-and-dining")).toBe("Food & Dining");
  });
  it("unknown slug → null", () => {
    expect(categoryFromSlug("not-a-category")).toBeNull();
  });
});
