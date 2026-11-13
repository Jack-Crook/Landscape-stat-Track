import { z } from "zod";

export type LineItem = { description: string; quantity: number; unitPrice: number };

const lineItemSchema = z.object({
  description: z.string().trim().min(1, "Describe each line"),
  quantity: z.number().positive("Quantity must be more than 0"),
  unitPrice: z.number().nonnegative(),
});

/** Hidden `lineItems` JSON field from LineItemsEditor → validated lines. */
export const lineItemsField = z
  .string({ error: "Add at least one line" })
  .transform((raw, ctx) => {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid line items" });
      return z.NEVER;
    }
  })
  .pipe(z.array(lineItemSchema).min(1, "Add at least one line"));

/** Parses a quote's stored text column. Bad data → empty list. */
export function parseStoredLines(raw: string | null | undefined): LineItem[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
