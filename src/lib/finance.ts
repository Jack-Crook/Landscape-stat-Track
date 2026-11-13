/**
 * Pure financial calculations. No database access: loaders in src/lib/data/
 * fetch rows and hand them here, which keeps every number on screen testable.
 *
 * Conventions (cents everywhere):
 * - Invoice totals and receipt totals are GST-inclusive; their GST is stored.
 * - "Ex" figures are GST-exclusive. When the business isn't GST-registered it
 *   can't claim GST credits or charge GST, so costs count in full.
 * - Cash basis: income counts when an invoice is paid. Accrual: when issued.
 */

import { toCents, type Cents } from "./money";
import { inRange, type Range } from "./periods";

export type Basis = "cash" | "accrual";

export type InvoiceLike = {
  status: string;
  issueDate: Date;
  paidAt: Date | null;
  total: string | number;
  gstAmount: string | number;
  clientId?: string | null;
  jobId?: string | null;
};

export type ReceiptLike = {
  status: string;
  date: Date;
  total: string | number;
  gstAmount: string | number;
  isCapital: boolean;
  jobId?: string | null;
  /** Portion of `total` that isn't a business deduction (e.g. food), GST-inclusive. */
  nonDeductibleCents?: number;
  /** GST inside the non-deductible portion — not claimable as a credit. */
  nonDeductibleGstCents?: number;
};

export type CostLineLike = { createdAt: Date; amount: string | number; gstAmount: string | number; type: string };
export type MileageLike = { createdAt: Date; total: string | number };

/** When an invoice counts as income, or null if it doesn't (draft, void, unpaid on cash basis). */
export function incomeDate(inv: InvoiceLike, basis: Basis): Date | null {
  if (inv.status === "void" || inv.status === "draft") return null;
  if (basis === "accrual") return inv.issueDate;
  return inv.status === "paid" ? inv.paidAt ?? inv.issueDate : null;
}

export type PeriodSummary = {
  /** G1 — total sales including GST. */
  salesInc: Cents;
  /** 1A — GST on sales. */
  salesGst: Cents;
  salesEx: Cents;
  /** G10 — capital purchases including GST. */
  capitalInc: Cents;
  /** G11 — non-capital purchases including GST. */
  nonCapitalInc: Cents;
  /** 1B — GST credits claimable. */
  gstCredits: Cents;
  /** 1A − 1B. Positive = pay the ATO, negative = refund. */
  netGst: Cents;
  receiptsInc: Cents;
  costLinesInc: Cents;
  mileage: Cents;
  /** Deductible business expenses (ex GST when registered), including mileage. */
  expenses: Cents;
  nonDeductible: Cents;
  profit: Cents;
  invoiceCount: number;
  receiptCount: number;
};

export function summarisePeriod(input: {
  invoices: InvoiceLike[];
  receipts: ReceiptLike[];
  costLines: CostLineLike[];
  mileage: MileageLike[];
  range: { start: Date; end: Date };
  basis: Basis;
  gstRegistered: boolean;
}): PeriodSummary {
  const { range, basis, gstRegistered } = input;
  let salesInc = 0;
  let salesGst = 0;
  let invoiceCount = 0;
  for (const inv of input.invoices) {
    if (!inRange(incomeDate(inv, basis), range)) continue;
    salesInc += toCents(inv.total);
    salesGst += gstRegistered ? toCents(inv.gstAmount) : 0;
    invoiceCount++;
  }

  let capitalInc = 0;
  let nonCapitalInc = 0;
  let gstCredits = 0;
  let expenses = 0;
  let nonDeductible = 0;
  let receiptsInc = 0;
  let receiptCount = 0;
  for (const r of input.receipts) {
    if (r.status !== "confirmed" || !inRange(r.date, range)) continue;
    const total = toCents(r.total);
    const gst = toCents(r.gstAmount);
    const nd = Math.min(total, r.nonDeductibleCents ?? 0);
    const ndGst = Math.min(gst, r.nonDeductibleGstCents ?? 0);
    receiptsInc += total;
    receiptCount++;
    if (r.isCapital) capitalInc += total;
    else nonCapitalInc += total;
    nonDeductible += nd;
    if (gstRegistered) {
      gstCredits += gst - ndGst;
      expenses += total - nd - (gst - ndGst);
    } else {
      expenses += total - nd;
    }
  }

  let costLinesInc = 0;
  for (const c of input.costLines) {
    if (!inRange(c.createdAt, range)) continue;
    const amount = toCents(c.amount);
    const gst = toCents(c.gstAmount);
    costLinesInc += amount;
    nonCapitalInc += amount;
    if (gstRegistered) {
      gstCredits += gst;
      expenses += amount - gst;
    } else {
      expenses += amount;
    }
  }

  let mileage = 0;
  for (const m of input.mileage) {
    if (inRange(m.createdAt, range)) mileage += toCents(m.total);
  }
  expenses += mileage;

  const salesEx = salesInc - salesGst;
  return {
    salesInc,
    salesGst,
    salesEx,
    capitalInc,
    nonCapitalInc,
    gstCredits,
    netGst: salesGst - gstCredits,
    receiptsInc,
    costLinesInc,
    mileage,
    expenses,
    nonDeductible,
    profit: salesEx - expenses,
    invoiceCount,
    receiptCount,
  };
}

/** One summary per range (e.g. last 12 months), for charts. */
export function seriesByRange(
  ranges: Range[],
  input: Omit<Parameters<typeof summarisePeriod>[0], "range">
) {
  return ranges.map((range) => ({ label: range.label, start: range.start, ...summarisePeriod({ ...input, range }) }));
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export type JobFinancials = {
  /** What the client pays, GST-inclusive. Invoiced total if invoiced, else the quoted price. */
  priceInc: Cents;
  revenue: Cents; // ex GST when registered
  costs: {
    materials: Cents;
    labour: Cents;
    travel: Cents;
    other: Cents;
    receipts: Cents;
    mileage: Cents;
    total: Cents;
  };
  profit: Cents;
  /** Profit as % of revenue; null when there's no revenue. */
  margin: number | null;
  /** Profit per hour worked; null without hours. */
  profitPerHour: Cents | null;
  /** Actual costs − estimated costs; positive = over budget. Null without an estimate. */
  costVariance: Cents | null;
  hasPrice: boolean;
};

export function jobFinancials(input: {
  quotedPrice: string | number | null;
  invoices?: Array<{ status: string; total: string | number }>;
  costLines: Array<{ type: string; amount: string | number; gstAmount: string | number }>;
  mileage: Array<{ total: string | number }>;
  receipts: Array<{ status?: string; total: string | number; gstAmount: string | number }>;
  gstRegistered: boolean;
  hoursWorked?: string | number | null;
  estimatedCost?: string | number | null;
}): JobFinancials {
  const live = (input.invoices ?? []).filter((i) => i.status !== "void");
  const invoiced = live.reduce((s, i) => s + toCents(i.total), 0);
  const priceInc = live.length > 0 ? invoiced : toCents(input.quotedPrice);
  const hasPrice = live.length > 0 || (input.quotedPrice != null && input.quotedPrice !== "");
  const revenue = input.gstRegistered ? priceInc - Math.round(priceInc / 11) : priceInc;

  const exGst = (amount: string | number, gst: string | number) =>
    input.gstRegistered ? toCents(amount) - toCents(gst) : toCents(amount);

  const costs = { materials: 0, labour: 0, travel: 0, other: 0, receipts: 0, mileage: 0, total: 0 };
  for (const c of input.costLines) {
    const key = (["materials", "labour", "travel"].includes(c.type) ? c.type : "other") as
      | "materials"
      | "labour"
      | "travel"
      | "other";
    costs[key] += exGst(c.amount, c.gstAmount);
  }
  for (const r of input.receipts) {
    if (r.status && r.status !== "confirmed") continue;
    costs.receipts += exGst(r.total, r.gstAmount);
  }
  for (const m of input.mileage) costs.mileage += toCents(m.total);
  costs.total = costs.materials + costs.labour + costs.travel + costs.other + costs.receipts + costs.mileage;

  const profit = revenue - costs.total;
  const hours = input.hoursWorked == null || input.hoursWorked === "" ? 0 : Number(input.hoursWorked);
  const estimate = input.estimatedCost == null || input.estimatedCost === "" ? null : toCents(input.estimatedCost);

  return {
    priceInc,
    revenue,
    costs,
    profit,
    margin: revenue > 0 ? (profit / revenue) * 100 : null,
    profitPerHour: hours > 0 ? Math.round(profit / hours) : null,
    costVariance: estimate == null ? null : costs.total - estimate,
    hasPrice,
  };
}

/**
 * Price (ex GST) needed to hit a target margin on known costs:
 * margin = (price − cost) / price  →  price = cost / (1 − margin).
 */
export function priceForMargin(costCents: Cents, marginPct: number): Cents | null {
  if (marginPct >= 100 || marginPct < 0) return null;
  return Math.round(costCents / (1 - marginPct / 100));
}

/** GST registration watch: the ATO threshold is $75,000 GST turnover a year. */
export const GST_REGISTRATION_THRESHOLD_CENTS = 7_500_000;

/** Straight-line projection of full-year turnover from year-to-date. */
export function projectAnnual(ytdCents: Cents, fyStart: Date, now: Date): Cents {
  const elapsed = (now.getTime() - fyStart.getTime()) / 86_400_000;
  if (elapsed < 14) return ytdCents; // too early to project meaningfully
  return Math.round((ytdCents / elapsed) * 365);
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
