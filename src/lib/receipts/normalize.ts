import { gstFromInclusive, isValidAbn } from "@/lib/gst";
import { toCents, type Cents } from "@/lib/money";
import { parseDateOnly } from "@/lib/periods";
import type { ReceiptExtraction } from "./schema";

export type DraftItem = {
  description: string;
  itemName: string;
  brand: string | null;
  sku: string | null;
  category: string;
  quantity: number;
  unit: string | null;
  unitPriceCents: number | null;
  discountCents: number | null;
  /** GST-inclusive line total. */
  totalCents: Cents;
  gstCents: Cents;
  gstFree: boolean;
};

export type DraftReceipt = {
  vendor: string;
  vendorBranch: string | null;
  vendorAbn: string | null;
  vendorAddress: string | null;
  vendorPhone: string | null;
  receiptNumber: string | null;
  date: Date | null;
  time: string | null;
  paymentMethod: string | null;
  cardLast4: string | null;
  subtotalCents: Cents;
  discountCents: Cents | null;
  gstCents: Cents;
  totalCents: Cents;
  isTaxInvoice: boolean;
  category: string;
  notes: string | null;
  confidence: string;
  items: DraftItem[];
  warnings: string[];
};

/** Threshold (GST-inclusive) above which the ATO needs a tax invoice to claim the GST credit. */
export const TAX_INVOICE_THRESHOLD_CENTS = 8250;

const clean = (s: string | null | undefined) => {
  const t = s?.trim();
  return t ? t : null;
};

/** Sentence-cases a generic item name so "SHOVEL" and "shovel" group together. */
export function normalizeItemName(name: string): string {
  const t = name.trim().replace(/\s+/g, " ");
  if (!t) return "Item";
  const lower = t.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Turns Claude's raw extraction into amounts we can store:
 * - every line total becomes GST-inclusive (trade invoices often print ex-GST lines),
 * - per-line GST is derived, then nudged so the lines add up to the GST the receipt printed,
 * - totals are reconciled, and anything that doesn't add up becomes a warning
 *   for the review screen rather than being silently "fixed".
 */
export function normalizeExtraction(x: ReceiptExtraction, now = new Date()): DraftReceipt {
  const warnings: string[] = [];
  const inclusive = x.amounts_include_gst;

  const items: DraftItem[] = x.line_items.map((li) => {
    const printed = toCents(li.line_total);
    const totalCents = inclusive || li.gst_free ? printed : Math.round(printed * 1.1);
    return {
      description: li.description.trim() || li.item_name,
      itemName: normalizeItemName(li.item_name || li.description),
      brand: clean(li.brand),
      sku: clean(li.sku),
      category: li.category,
      quantity: li.quantity > 0 ? li.quantity : 1,
      unit: clean(li.unit),
      // Store unit prices GST-inclusive too, so prices compare across shops.
      unitPriceCents:
        li.unit_price == null ? null : inclusive || li.gst_free ? toCents(li.unit_price) : Math.round(toCents(li.unit_price) * 1.1),
      discountCents: li.discount == null ? null : toCents(Math.abs(li.discount)),
      totalCents,
      gstCents: li.gst_free ? 0 : gstFromInclusive(totalCents),
      gstFree: li.gst_free,
    };
  });

  const itemsTotal = items.reduce((s, i) => s + i.totalCents, 0);
  const itemsGst = items.reduce((s, i) => s + i.gstCents, 0);

  let totalCents = x.total != null ? toCents(x.total) : itemsTotal;
  if (x.total == null) warnings.push("Total wasn't readable — using the sum of the lines.");
  if (totalCents <= 0 && itemsTotal > 0) totalCents = itemsTotal;

  // GST: trust the printed figure when there is one; otherwise derive from lines.
  let gstCents = x.gst_amount != null ? toCents(x.gst_amount) : itemsGst;
  if (x.gst_amount == null && items.length === 0) gstCents = gstFromInclusive(totalCents);

  // Spread any small GST difference onto the largest taxable line so items match the receipt.
  const gstDiff = gstCents - itemsGst;
  const taxable = items.filter((i) => !i.gstFree).sort((a, b) => b.totalCents - a.totalCents);
  if (gstDiff !== 0 && taxable.length > 0 && Math.abs(gstDiff) <= 5 * items.length) {
    taxable[0].gstCents += gstDiff;
  } else if (Math.abs(gstDiff) > 5 * Math.max(1, items.length) && items.length > 0) {
    warnings.push("The GST on the receipt doesn't match its lines — check which items are GST-free.");
  }

  if (gstCents > Math.round(totalCents / 11) + 2) {
    warnings.push("GST is more than 1/11 of the total, which isn't possible at 10%. Check the amounts.");
  }

  if (items.length > 0) {
    const rounding = toCents(x.rounding ?? 0);
    const diff = totalCents - rounding - itemsTotal;
    // Receipt-level discounts not attached to a line show up as a gap.
    const receiptDiscount = toCents(x.discount_total ?? 0);
    if (Math.abs(diff) > 5 && Math.abs(diff + receiptDiscount) > 5) {
      warnings.push(
        `The lines add up to $${(itemsTotal / 100).toFixed(2)} but the total is $${(totalCents / 100).toFixed(2)}. A line may be missing or misread.`
      );
    }
  } else {
    warnings.push("No line items were found, so this receipt won't show in item spending until you add some.");
  }

  const abnDigits = x.vendor_abn?.replace(/\D/g, "") || null;
  if (abnDigits && !isValidAbn(abnDigits)) {
    warnings.push(`ABN ${abnDigits} fails the ATO checksum — it may be misread.`);
  }
  const isTaxInvoice = x.document_type === "tax_invoice" || (!!abnDigits && gstCents > 0);
  if (totalCents > TAX_INVOICE_THRESHOLD_CENTS && gstCents > 0 && !abnDigits) {
    warnings.push("Over $82.50 with no supplier ABN: you need a tax invoice to claim this GST credit.");
  }

  const date = parseDateOnly(x.date);
  if (!date) warnings.push("Date wasn't readable — set it before saving.");
  else if (date.getTime() > now.getTime() + 86_400_000) warnings.push("The date is in the future — check it.");

  if (x.confidence === "low") warnings.push("The scan was hard to read. Double-check every amount.");
  for (const u of x.unreadable) warnings.push(`Unclear on the receipt: ${u}`);
  if (x.currency && x.currency.toUpperCase() !== "AUD") {
    warnings.push(`This receipt is in ${x.currency}. Amounts are stored as printed — convert to AUD before saving.`);
  }

  // Stored subtotal is always the GST-exclusive amount, whatever the receipt printed.
  const subtotalCents = totalCents - gstCents;

  return {
    vendor: clean(x.vendor_name) ?? "Unknown supplier",
    vendorBranch: clean(x.vendor_branch),
    vendorAbn: abnDigits,
    vendorAddress: clean(x.vendor_address),
    vendorPhone: clean(x.vendor_phone),
    receiptNumber: clean(x.receipt_number),
    date,
    time: clean(x.time),
    paymentMethod: x.payment_method === "unknown" ? null : x.payment_method,
    cardLast4: clean(x.card_last4)?.replace(/\D/g, "").slice(-4) || null,
    subtotalCents,
    discountCents: x.discount_total != null ? toCents(Math.abs(x.discount_total)) : null,
    gstCents,
    totalCents,
    isTaxInvoice,
    category: x.suggested_category,
    notes: clean(x.notes),
    confidence: x.confidence,
    items,
    warnings,
  };
}
