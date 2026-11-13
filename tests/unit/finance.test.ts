import { describe, expect, it } from "vitest";
import {
  incomeDate,
  jobFinancials,
  median,
  priceForMargin,
  projectAnnual,
  seriesByRange,
  summarisePeriod,
} from "@/lib/finance";
import { basQuarters, lastMonths } from "@/lib/periods";

const q2 = basQuarters(2026)[1]; // Oct–Dec 2026

const invoices = [
  // Paid in Q2: counts on both bases (issued in Q2 too)
  { status: "paid", issueDate: new Date(2026, 9, 5), paidAt: new Date(2026, 9, 20), total: "1100.00", gstAmount: "100.00" },
  // Issued in Q1, paid in Q2: cash basis only
  { status: "paid", issueDate: new Date(2026, 8, 25), paidAt: new Date(2026, 9, 2), total: "550.00", gstAmount: "50.00" },
  // Issued in Q2, unpaid: accrual only
  { status: "sent", issueDate: new Date(2026, 10, 1), paidAt: null, total: "220.00", gstAmount: "20.00" },
  { status: "void", issueDate: new Date(2026, 10, 1), paidAt: null, total: "9999.00", gstAmount: "909.00" },
  { status: "draft", issueDate: new Date(2026, 10, 1), paidAt: null, total: "500.00", gstAmount: "45.45" },
];

const receipts = [
  { status: "confirmed", date: new Date(2026, 9, 10), total: "186.60", gstAmount: "16.33", isCapital: false, nonDeductibleCents: 700, nonDeductibleGstCents: 0 },
  { status: "confirmed", date: new Date(2026, 10, 3), total: "2200.00", gstAmount: "200.00", isCapital: true },
  { status: "needs_review", date: new Date(2026, 10, 3), total: "50.00", gstAmount: "4.55", isCapital: false },
  { status: "confirmed", date: new Date(2026, 6, 3), total: "99.00", gstAmount: "9.00", isCapital: false }, // Q1
];

const costLines = [{ createdAt: new Date(2026, 9, 15), amount: "110.00", gstAmount: "10.00", type: "materials" }];
const mileage = [{ createdAt: new Date(2026, 9, 15), total: "44.00" }];

describe("incomeDate", () => {
  it("follows the accounting basis", () => {
    expect(incomeDate(invoices[1], "cash")).toEqual(new Date(2026, 9, 2));
    expect(incomeDate(invoices[1], "accrual")).toEqual(new Date(2026, 8, 25));
    expect(incomeDate(invoices[2], "cash")).toBeNull();
    expect(incomeDate(invoices[3], "accrual")).toBeNull();
    expect(incomeDate(invoices[4], "accrual")).toBeNull();
  });
});

describe("summarisePeriod (BAS)", () => {
  it("cash basis, GST registered", () => {
    const s = summarisePeriod({ invoices, receipts, costLines, mileage, range: q2, basis: "cash", gstRegistered: true });
    expect(s.salesInc).toBe(165000); // G1
    expect(s.salesGst).toBe(15000); // 1A
    expect(s.capitalInc).toBe(220000); // G10
    expect(s.nonCapitalInc).toBe(18660 + 11000); // G11: receipt + cost line
    expect(s.gstCredits).toBe(1633 + 20000 + 1000); // 1B (food item had no GST)
    expect(s.netGst).toBe(15000 - 22633);
    expect(s.mileage).toBe(4400);
    // Expenses ex GST: (186.60 − 7.00 food − 16.33) + (2200 − 200) + (110 − 10) + 44 mileage
    expect(s.expenses).toBe(16327 + 200000 + 10000 + 4400);
    expect(s.nonDeductible).toBe(700);
    expect(s.profit).toBe(150000 - s.expenses);
    expect(s.receiptCount).toBe(2);
  });

  it("accrual basis counts issued invoices", () => {
    const s = summarisePeriod({ invoices, receipts, costLines, mileage, range: q2, basis: "accrual", gstRegistered: true });
    expect(s.salesInc).toBe(110000 + 22000);
    expect(s.invoiceCount).toBe(2);
  });

  it("not registered: no GST either way, costs count in full", () => {
    const s = summarisePeriod({ invoices, receipts, costLines, mileage, range: q2, basis: "cash", gstRegistered: false });
    expect(s.salesGst).toBe(0);
    expect(s.salesEx).toBe(165000);
    expect(s.gstCredits).toBe(0);
    expect(s.expenses).toBe(18660 - 700 + 220000 + 11000 + 4400);
  });

  it("builds a monthly series", () => {
    const months = lastMonths(new Date(2026, 10, 13), 3);
    const series = seriesByRange(months, { invoices, receipts, costLines, mileage, basis: "cash", gstRegistered: true });
    expect(series.map((m) => m.label)).toHaveLength(3);
    expect(series[1].salesInc).toBe(165000); // October
    expect(series[2].salesInc).toBe(0); // November (only unpaid)
  });
});

describe("jobFinancials", () => {
  const base = {
    quotedPrice: "1100.00",
    costLines: [
      { type: "materials", amount: "220.00", gstAmount: "20.00" },
      { type: "labour", amount: "300.00", gstAmount: "0" },
    ],
    mileage: [{ total: "26.40" }],
    receipts: [
      { status: "confirmed", total: "55.00", gstAmount: "5.00" },
      { status: "needs_review", total: "999.00", gstAmount: "90.00" },
    ],
    gstRegistered: true,
    hoursWorked: "8",
    estimatedCost: "500",
  };

  it("works out profit ex GST", () => {
    const f = jobFinancials(base);
    expect(f.priceInc).toBe(110000);
    expect(f.revenue).toBe(100000);
    expect(f.costs).toEqual({ materials: 20000, labour: 30000, travel: 0, other: 0, receipts: 5000, mileage: 2640, total: 57640 });
    expect(f.profit).toBe(42360);
    expect(f.margin).toBeCloseTo(42.36);
    expect(f.profitPerHour).toBe(5295);
    expect(f.costVariance).toBe(7640); // $76.40 over the estimate
  });

  it("prefers invoiced totals over the quote", () => {
    const f = jobFinancials({ ...base, invoices: [{ status: "sent", total: "1320.00" }, { status: "void", total: "5000" }] });
    expect(f.priceInc).toBe(132000);
    expect(f.revenue).toBe(120000);
  });

  it("handles no price, no hours, not registered", () => {
    const f = jobFinancials({ ...base, quotedPrice: null, hoursWorked: null, estimatedCost: null, gstRegistered: false });
    expect(f.hasPrice).toBe(false);
    expect(f.revenue).toBe(0);
    expect(f.margin).toBeNull();
    expect(f.profitPerHour).toBeNull();
    expect(f.costVariance).toBeNull();
    expect(f.costs.materials).toBe(22000);
  });
});

describe("helpers", () => {
  it("prices for a target margin", () => {
    expect(priceForMargin(60000, 40)).toBe(100000);
    expect(priceForMargin(60000, 100)).toBeNull();
  });

  it("projects annual turnover", () => {
    const start = new Date(2026, 6, 1);
    expect(projectAnnual(1000, start, new Date(2026, 6, 5))).toBe(1000);
    const p = projectAnnual(3_000_000, start, new Date(2026, 9, 1)); // ~92 days
    expect(p).toBeGreaterThan(11_000_000);
    expect(p).toBeLessThan(12_500_000);
  });

  it("finds medians", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});
