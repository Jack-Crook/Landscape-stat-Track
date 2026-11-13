import { describe, expect, it } from "vitest";
import {
  bracketTax,
  estimateIncomeTax,
  lowIncomeTaxOffset,
  medicareLevy,
  RESIDENT_RATES,
} from "@/lib/tax";
import {
  addMonths,
  basMonths,
  basQuarters,
  currentBasPeriod,
  fyLabel,
  fyRange,
  fyStartYear,
  lastMonths,
  parseDateOnly,
  resolvePeriod,
  toDateInput,
  weekRange,
} from "@/lib/periods";

describe("income tax", () => {
  it("applies 2025–26 resident brackets", () => {
    const r = RESIDENT_RATES[2025];
    expect(bracketTax(18_200, r)).toBe(0);
    expect(bracketTax(45_000, r)).toBeCloseTo(4_288, 0); // 26,800 × 16%
    expect(bracketTax(135_000, r)).toBeCloseTo(31_288, 0);
    expect(bracketTax(190_000, r)).toBeCloseTo(51_638, 0);
    expect(bracketTax(200_000, r)).toBeCloseTo(56_138, 0);
  });

  it("uses 15% for the second bracket from 2026–27", () => {
    expect(bracketTax(45_000, RESIDENT_RATES[2026])).toBeCloseTo(4_020, 0);
  });

  it("falls back to the nearest known year", () => {
    const later = estimateIncomeTax({ businessProfit: 60_000, fyStartYear: 2031 });
    const latest = estimateIncomeTax({ businessProfit: 60_000, fyStartYear: 2027 });
    expect(later.businessTax).toBe(latest.businessTax);
  });

  it("computes LITO and Medicare shade-in", () => {
    expect(lowIncomeTaxOffset(30_000)).toBe(700);
    expect(lowIncomeTaxOffset(41_250)).toBeCloseTo(512.5);
    expect(lowIncomeTaxOffset(66_667)).toBeCloseTo(0, 0);
    expect(lowIncomeTaxOffset(100_000)).toBe(0);
    expect(medicareLevy(20_000)).toBe(0);
    expect(medicareLevy(30_000)).toBeCloseTo(277.8, 1); // shading in at 10c/$
    expect(medicareLevy(100_000)).toBe(2_000);
  });

  it("estimates a sole trader's business tax including offsets", () => {
    const e = estimateIncomeTax({ businessProfit: 80_000, fyStartYear: 2025 });
    // Tax 4,288 + 35,000 × 30% = 14,788, + Medicare 1,600 − LITO 0 − SBITO 1,000 (capped)
    expect(e.businessTax).toBeCloseTo(15_388, 0);
    expect(e.setAsideRate).toBeCloseTo(15_388 / 80_000, 4);
    expect(e.marginalRate).toBeCloseTo(0.32);
  });

  it("counts other income so the business is taxed at the right marginal rate", () => {
    const alone = estimateIncomeTax({ businessProfit: 30_000, fyStartYear: 2025 });
    const withJob = estimateIncomeTax({ businessProfit: 30_000, otherIncome: 90_000, fyStartYear: 2025 });
    expect(withJob.businessTax).toBeGreaterThan(alone.businessTax);
  });

  it("is zero on a loss", () => {
    expect(estimateIncomeTax({ businessProfit: -5_000, fyStartYear: 2025 }).businessTax).toBe(0);
  });

  it("taxes companies at the base rate", () => {
    const e = estimateIncomeTax({ businessProfit: 100_000, entityType: "company", fyStartYear: 2025 });
    expect(e.businessTax).toBe(25_000);
  });
});

describe("periods", () => {
  it("names the Australian financial year by its start", () => {
    expect(fyStartYear(new Date(2026, 6, 1))).toBe(2026);
    expect(fyStartYear(new Date(2026, 5, 30))).toBe(2025);
    expect(fyLabel(2026)).toBe("FY26–27");
    const r = fyRange(2026);
    expect(r.start).toEqual(new Date(2026, 6, 1));
    expect(r.end).toEqual(new Date(2027, 6, 1));
  });

  it("has BAS quarters with ATO due dates", () => {
    const q = basQuarters(2026);
    expect(q.map((p) => p.due.toDateString())).toEqual([
      new Date(2026, 9, 28).toDateString(),
      new Date(2027, 1, 28).toDateString(),
      new Date(2027, 3, 28).toDateString(),
      new Date(2027, 6, 28).toDateString(),
    ]);
    expect(currentBasPeriod(new Date(2026, 10, 13), "quarterly").quarter).toBe(2);
    const m = basMonths(2026);
    expect(m).toHaveLength(12);
    expect(m[0].due).toEqual(new Date(2026, 7, 21));
  });

  it("parses date-only strings at local noon", () => {
    const d = parseDateOnly("2026-11-13")!;
    expect(d.getDate()).toBe(13);
    expect(d.getHours()).toBe(12);
    expect(toDateInput(d)).toBe("2026-11-13");
    expect(parseDateOnly("13/11/2026")).toBeNull();
    expect(parseDateOnly(undefined)).toBeNull();
  });

  it("starts weeks on Monday", () => {
    const w = weekRange(new Date(2026, 10, 13)); // Friday
    expect(w.start.getDay()).toBe(1);
    expect(w.start.getDate()).toBe(9);
  });

  it("clamps month arithmetic to month end", () => {
    expect(addMonths(new Date(2026, 0, 31), 1).getDate()).toBe(28);
  });

  it("returns the last N months oldest first", () => {
    const m = lastMonths(new Date(2026, 10, 13), 12);
    expect(m).toHaveLength(12);
    expect(m[11].start).toEqual(new Date(2026, 10, 1));
    expect(m[0].start).toEqual(new Date(2025, 11, 1));
  });

  it("resolves period picker values", () => {
    const now = new Date(2026, 10, 13);
    expect(resolvePeriod(undefined, now).key).toBe("fy");
    expect(resolvePeriod("month", now).start).toEqual(new Date(2026, 10, 1));
    expect(resolvePeriod("last-fy", now).start).toEqual(new Date(2025, 6, 1));
    const c = resolvePeriod("custom", now, { from: "2026-08-01", to: "2026-08-31" });
    expect(c.key).toBe("custom");
    expect(c.end).toEqual(new Date(2026, 8, 1));
    expect(resolvePeriod("custom", now, { from: "2026-09-01", to: "2026-08-01" }).key).toBe("fy");
  });
});
