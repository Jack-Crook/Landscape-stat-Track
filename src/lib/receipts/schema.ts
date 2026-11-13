import { z } from "zod";
import { EXPENSE_CATEGORY_KEYS } from "@/lib/constants";

/**
 * The structured output the receipt scanner asks Claude for. Every field the
 * model can't read is null rather than guessed — the review screen shows the
 * gaps so the person fills them in.
 */
export const ExtractedLineItem = z.object({
  description: z.string().describe("The line exactly as printed, e.g. 'CYCLONE SHOVEL RND MOUTH FG'"),
  item_name: z
    .string()
    .describe(
      "Short generic singular name in sentence case that groups the same kind of thing across shops, e.g. 'Shovel', 'Garden mulch', 'Unleaded petrol', 'Trimmer line'. No brand, size or SKU."
    ),
  brand: z.string().nullable(),
  sku: z.string().nullable().describe("Product code / barcode / item number if printed"),
  category: z.enum(EXPENSE_CATEGORY_KEYS),
  quantity: z.number().describe("Units bought. Litres for fuel. 1 if not printed."),
  unit: z
    .string()
    .nullable()
    .describe("One of: each, L, kg, t, m, m2, m3, bag, pack, roll, box, set, hr, day. Use 'each' for single items. Bulk landscaping supplies are usually m3 or t."),
  unit_price: z.number().nullable(),
  discount: z.number().nullable().describe("Discount applied to this line, as a positive number"),
  line_total: z.number().describe("Amount charged for this line after its discount, as printed"),
  gst_free: z.boolean().describe("True only if the receipt marks this line GST-free / no GST"),
});

export const ReceiptExtraction = z.object({
  is_receipt: z
    .boolean()
    .describe("False if the image is not a receipt, invoice or bill (e.g. a photo of a garden)"),
  document_type: z.enum(["tax_invoice", "receipt", "invoice", "bill", "statement", "quote", "other"]),
  vendor_name: z.string().nullable().describe("Trading/brand name, e.g. 'Bunnings Warehouse'"),
  vendor_branch: z.string().nullable().describe("Store/branch name or location, e.g. 'Ashmore'"),
  vendor_abn: z.string().nullable().describe("11-digit ABN, digits only"),
  vendor_address: z.string().nullable(),
  vendor_phone: z.string().nullable(),
  receipt_number: z.string().nullable().describe("Receipt, invoice, transaction or docket number"),
  date: z.string().nullable().describe("Purchase date as YYYY-MM-DD. Australian receipts print DD/MM/YYYY."),
  time: z.string().nullable().describe("24-hour HH:MM"),
  currency: z.string().describe("ISO code, AUD unless clearly otherwise"),
  payment_method: z.enum(["card", "cash", "eftpos", "bank_transfer", "account", "other", "unknown"]),
  card_last4: z.string().nullable(),
  amounts_include_gst: z
    .boolean()
    .describe(
      "True if line totals already include GST (normal for retail). False if lines are ex-GST and GST is added at the bottom (common on trade invoices)."
    ),
  subtotal: z.number().nullable(),
  discount_total: z.number().nullable().describe("Total of all discounts, positive"),
  gst_amount: z.number().nullable().describe("GST shown on the receipt (may be labelled 'GST', 'Tax', 'incl. GST')"),
  rounding: z.number().nullable().describe("Cash rounding adjustment, signed"),
  total: z.number().nullable().describe("Final amount paid"),
  line_items: z.array(ExtractedLineItem),
  suggested_category: z.enum(EXPENSE_CATEGORY_KEYS).describe("The category most of the spend falls in"),
  notes: z
    .string()
    .nullable()
    .describe("Anything else useful: warranty, loyalty number, delivery address, account name, handwritten notes"),
  confidence: z.enum(["high", "medium", "low"]),
  unreadable: z.array(z.string()).describe("Fields or lines that were blurry, cut off or ambiguous"),
});

export type ReceiptExtraction = z.infer<typeof ReceiptExtraction>;
export type ExtractedLineItem = z.infer<typeof ExtractedLineItem>;
