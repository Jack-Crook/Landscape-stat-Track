import type { Cents } from "./money";

/** Australian GST is 10%. Kept as a constant; organisations.taxRate exists for other regions. */
export const GST_RATE = 0.1;

/**
 * GST contained in a GST-inclusive amount: amount × rate / (1 + rate).
 * At 10% this is the familiar "divide by 11". Rounded to the cent.
 */
export function gstFromInclusive(inclusive: Cents, rate = GST_RATE): Cents {
  return Math.round((inclusive * rate) / (1 + rate));
}

/** GST to add on top of a GST-exclusive amount. */
export function gstOnExclusive(exclusive: Cents, rate = GST_RATE): Cents {
  return Math.round(exclusive * rate);
}

export function exclusiveFromInclusive(inclusive: Cents, rate = GST_RATE): Cents {
  return inclusive - gstFromInclusive(inclusive, rate);
}

export type PricedLine = { quantity: number; unitPrice: number };

/**
 * Totals for quote/invoice line items. Unit prices are GST-exclusive dollars.
 * Each line is rounded to the cent before summing, the way an invoice prints.
 * When the business isn't GST-registered, no GST is charged.
 */
export function lineItemTotals(items: PricedLine[], gstRegistered: boolean, rate = GST_RATE) {
  const subtotal = items.reduce(
    (sum, i) => sum + Math.round(Number(i.quantity) * Number(i.unitPrice) * 100),
    0
  );
  const gst = gstRegistered ? gstOnExclusive(subtotal, rate) : 0;
  return { subtotal, gst, total: subtotal + gst };
}

/**
 * Australian Business Number checksum (ATO algorithm): subtract 1 from the first
 * digit, multiply each digit by its weight, the sum must be divisible by 89.
 */
export function isValidAbn(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const digits = raw.replace(/\s/g, "");
  if (!/^\d{11}$/.test(digits)) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const sum = digits
    .split("")
    .map(Number)
    .reduce((acc, d, i) => acc + (i === 0 ? d - 1 : d) * weights[i], 0);
  return sum % 89 === 0;
}

/** "51824753556" → "51 824 753 556". Leaves anything that isn't 11 digits alone. */
export function formatAbn(raw: string | null | undefined): string {
  if (!raw) return "";
  const d = raw.replace(/\s/g, "");
  if (!/^\d{11}$/.test(d)) return raw;
  return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
}
