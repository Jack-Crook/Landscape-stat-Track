/**
 * Australian income tax ESTIMATES for the dashboard's "put this much aside" figure.
 *
 * Deliberately simple and labelled as an estimate everywhere it shows: it ignores
 * HELP/HECS repayments, the Medicare levy surcharge, family thresholds, offsets
 * other than LITO and the small business income tax offset, PAYG instalments
 * already paid, and losses carried forward. Rates live here, keyed by the year
 * the financial year starts in, so updating for a new FY is a one-line change.
 *
 * Sources: ATO individual resident tax rates (Stage 3 changes from 1 July 2024,
 * 16% → 15% from 1 July 2026, → 14% from 1 July 2027); base rate entity company
 * rate 25%; Medicare levy 2%; LITO max $700; small business income tax offset
 * 16% capped at $1,000.
 */

export type Bracket = { upTo: number; rate: number };

const STAGE3_2024: Bracket[] = [
  { upTo: 18_200, rate: 0 },
  { upTo: 45_000, rate: 0.16 },
  { upTo: 135_000, rate: 0.3 },
  { upTo: 190_000, rate: 0.37 },
  { upTo: Infinity, rate: 0.45 },
];

export const RESIDENT_RATES: Record<number, Bracket[]> = {
  2024: STAGE3_2024,
  2025: STAGE3_2024,
  2026: STAGE3_2024.map((b) => (b.rate === 0.16 ? { ...b, rate: 0.15 } : b)),
  2027: STAGE3_2024.map((b) => (b.rate === 0.16 ? { ...b, rate: 0.14 } : b)),
};

export const COMPANY_BASE_RATE = 0.25;
export const MEDICARE_LEVY = 0.02;
/** Singles low-income threshold (2024–25). Below it no levy; shades in at 10c/$ above. */
export const MEDICARE_LOW_THRESHOLD = 27_222;

function ratesFor(fyStartYear: number): Bracket[] {
  if (RESIDENT_RATES[fyStartYear]) return RESIDENT_RATES[fyStartYear];
  const known = Object.keys(RESIDENT_RATES).map(Number).sort((a, b) => a - b);
  // Before the table: use the earliest; after it: the latest legislated.
  return RESIDENT_RATES[fyStartYear < known[0] ? known[0] : known[known.length - 1]];
}

/** Tax on a taxable income (whole dollars) using progressive brackets. */
export function bracketTax(income: number, brackets: Bracket[]): number {
  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    if (income <= lower) break;
    const taxable = Math.min(income, b.upTo) - lower;
    tax += taxable * b.rate;
    lower = b.upTo;
  }
  return tax;
}

export function marginalRate(income: number, brackets: Bracket[]): number {
  return (brackets.find((b) => income <= b.upTo) ?? brackets[brackets.length - 1]).rate;
}

/** Low income tax offset: $700, reduced 5c/$ from $37,500 to $45,000, then 1.5c/$ to $66,667. */
export function lowIncomeTaxOffset(income: number): number {
  if (income <= 37_500) return 700;
  if (income <= 45_000) return 700 - (income - 37_500) * 0.05;
  if (income <= 66_667) return Math.max(0, 325 - (income - 45_000) * 0.015);
  return 0;
}

export function medicareLevy(income: number): number {
  if (income <= MEDICARE_LOW_THRESHOLD) return 0;
  return Math.min(income * MEDICARE_LEVY, (income - MEDICARE_LOW_THRESHOLD) * 0.1);
}

/** Individual's total tax (income tax − LITO, floored at 0, + Medicare levy). */
function individualTax(income: number, brackets: Bracket[]) {
  const gross = bracketTax(income, brackets);
  const lito = Math.min(gross, lowIncomeTaxOffset(income));
  const medicare = medicareLevy(income);
  return { gross, lito, medicare, net: Math.max(0, gross - lito) + medicare };
}

export type TaxEstimate = {
  entityType: "sole_trader" | "company";
  businessProfit: number;
  taxableIncome: number;
  /** Tax attributable to the business profit (what to set aside from it). */
  businessTax: number;
  incomeTax: number;
  medicare: number;
  offsets: number;
  marginalRate: number;
  /** businessTax / businessProfit, 0 when there is no profit. */
  setAsideRate: number;
};

/**
 * Estimates the tax the business profit adds for the year.
 * Sole trader: profit is personal income on top of `otherIncome`, so the figure
 * is the *difference* in total tax with and without the business, minus the
 * small business income tax offset. Company: flat base-rate on profit.
 */
export function estimateIncomeTax(opts: {
  businessProfit: number;
  otherIncome?: number;
  entityType?: string;
  fyStartYear: number;
}): TaxEstimate {
  const profit = Math.max(0, opts.businessProfit);
  const other = Math.max(0, opts.otherIncome ?? 0);

  if (opts.entityType === "company") {
    const tax = profit * COMPANY_BASE_RATE;
    return {
      entityType: "company",
      businessProfit: opts.businessProfit,
      taxableIncome: profit,
      businessTax: round2(tax),
      incomeTax: round2(tax),
      medicare: 0,
      offsets: 0,
      marginalRate: COMPANY_BASE_RATE,
      setAsideRate: profit > 0 ? COMPANY_BASE_RATE : 0,
    };
  }

  const brackets = ratesFor(opts.fyStartYear);
  const withBiz = individualTax(other + profit, brackets);
  const withoutBiz = individualTax(other, brackets);

  // Small business income tax offset: 16% of the income tax on the business share, max $1,000.
  const share = other + profit > 0 ? profit / (other + profit) : 0;
  const sbito = Math.min(1_000, Math.max(0, withBiz.gross - withBiz.lito) * share * 0.16);

  const businessTax = Math.max(0, withBiz.net - withoutBiz.net - sbito);
  return {
    entityType: "sole_trader",
    businessProfit: opts.businessProfit,
    taxableIncome: other + profit,
    businessTax: round2(businessTax),
    incomeTax: round2(Math.max(0, withBiz.gross - withBiz.lito - sbito)),
    medicare: round2(withBiz.medicare),
    offsets: round2(withBiz.lito + sbito),
    marginalRate: marginalRate(other + profit, brackets) + (other + profit > MEDICARE_LOW_THRESHOLD ? MEDICARE_LEVY : 0),
    setAsideRate: profit > 0 ? businessTax / profit : 0,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
