import "server-only";
import { eq, sql } from "drizzle-orm";
import { type Tx } from "@/db";
import { invoices, organisations, quotes, type InvoiceLineItem, type Organisation } from "@/db/schema";
import { gstFromInclusive, lineItemTotals } from "@/lib/gst";
import { fromCents, toCents } from "@/lib/money";
import { addDays } from "@/lib/periods";

/** Claims the next invoice number for an org inside a transaction ("INV-0007"). */
export async function nextInvoiceNumber(tx: Tx, orgId: string) {
  const [row] = await tx
    .update(organisations)
    .set({ nextInvoiceNumber: sql`${organisations.nextInvoiceNumber} + 1` })
    .where(eq(organisations.id, orgId))
    .returning({ n: organisations.nextInvoiceNumber, prefix: organisations.invoicePrefix });
  return `${row.prefix}${String(row.n - 1).padStart(4, "0")}`;
}

export async function nextQuoteNumber(tx: Tx, orgId: string) {
  const [row] = await tx
    .update(organisations)
    .set({ nextQuoteNumber: sql`${organisations.nextQuoteNumber} + 1` })
    .where(eq(organisations.id, orgId))
    .returning({ n: organisations.nextQuoteNumber, prefix: organisations.quotePrefix });
  return `${row.prefix}${String(row.n - 1).padStart(4, "0")}`;
}

/**
 * Line items for invoicing a job: the accepted quote's lines if there is one,
 * otherwise a single line for the job at its GST-inclusive price.
 */
export async function lineItemsForJob(
  tx: Tx,
  job: { id: string; name: string; quotedPrice: string | null },
  gstRegistered: boolean
): Promise<InvoiceLineItem[]> {
  const quote = await tx.query.quotes.findFirst({ where: eq(quotes.jobId, job.id) });
  if (quote) {
    try {
      const items = JSON.parse(quote.lineItems) as InvoiceLineItem[];
      if (Array.isArray(items) && items.length > 0) return items;
    } catch {
      // fall through to a single line
    }
  }
  const price = toCents(job.quotedPrice);
  const ex = gstRegistered ? price - gstFromInclusive(price) : price;
  return [{ description: job.name, quantity: 1, unitPrice: ex / 100 }];
}

export async function createInvoice(
  tx: Tx,
  org: Pick<Organisation, "id" | "gstRegistered" | "paymentTermsDays">,
  input: {
    jobId?: string | null;
    clientId?: string | null;
    lineItems: InvoiceLineItem[];
    issueDate?: Date;
    dueDate?: Date | null;
    status?: "draft" | "sent" | "paid";
    paidAt?: Date | null;
    notes?: string | null;
  }
) {
  const totals = lineItemTotals(input.lineItems, org.gstRegistered);
  const issueDate = input.issueDate ?? new Date();
  const status = input.status ?? "draft";
  const [row] = await tx
    .insert(invoices)
    .values({
      orgId: org.id,
      jobId: input.jobId ?? null,
      clientId: input.clientId ?? null,
      number: await nextInvoiceNumber(tx, org.id),
      status,
      issueDate,
      dueDate: input.dueDate === undefined ? addDays(issueDate, org.paymentTermsDays) : input.dueDate,
      lineItems: input.lineItems,
      subtotal: fromCents(totals.subtotal),
      gstAmount: fromCents(totals.gst),
      total: fromCents(totals.total),
      amountPaid: status === "paid" ? fromCents(totals.total) : "0",
      paidAt: status === "paid" ? input.paidAt ?? new Date() : null,
      sentAt: status !== "draft" ? new Date() : null,
      notes: input.notes ?? null,
    })
    .returning();
  return row;
}
