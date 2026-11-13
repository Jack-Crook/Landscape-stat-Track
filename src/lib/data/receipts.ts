import "server-only";
import { and, between, eq, ne, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { receiptItems, receipts } from "@/db/schema";
import { gstFromInclusive } from "@/lib/gst";
import { fromCents } from "@/lib/money";
import { addDays } from "@/lib/periods";
import type { DraftItem, DraftReceipt } from "@/lib/receipts/normalize";

/** Replaces a receipt's line items. Per-line GST is nudged so the lines sum to the receipt's GST. */
export async function writeItems(tx: Tx, orgId: string, receiptId: string, items: DraftItem[], receiptGstCents: number) {
  await tx.delete(receiptItems).where(eq(receiptItems.receiptId, receiptId));
  if (items.length === 0) return;
  const rows = items.map((i) => ({ ...i, gstCents: i.gstFree ? 0 : i.gstCents ?? gstFromInclusive(i.totalCents) }));
  const sum = rows.reduce((s, i) => s + i.gstCents, 0);
  const diff = receiptGstCents - sum;
  const taxable = rows.filter((i) => !i.gstFree).sort((a, b) => b.totalCents - a.totalCents);
  if (diff !== 0 && taxable.length && Math.abs(diff) <= 5 * rows.length) taxable[0].gstCents += diff;

  await tx.insert(receiptItems).values(
    rows.map((i, position) => ({
      orgId,
      receiptId,
      position,
      description: i.description,
      itemName: i.itemName,
      brand: i.brand,
      sku: i.sku,
      category: i.category,
      quantity: String(i.quantity),
      unit: i.unit,
      unitPrice: i.unitPriceCents == null ? null : (i.unitPriceCents / 100).toFixed(4),
      discount: i.discountCents == null ? null : fromCents(i.discountCents),
      total: fromCents(i.totalCents),
      gstAmount: fromCents(Math.max(0, i.gstCents)),
      gstFree: i.gstFree,
    }))
  );
}

/** Inserts a scanned receipt for review, with its items. */
export async function insertDraftReceipt(
  orgId: string,
  draft: DraftReceipt,
  opts: { fileId: string | null; jobId: string | null; raw: unknown }
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(receipts)
      .values({
        orgId,
        jobId: opts.jobId,
        status: "needs_review",
        vendor: draft.vendor,
        vendorBranch: draft.vendorBranch,
        vendorAbn: draft.vendorAbn,
        vendorAddress: draft.vendorAddress,
        vendorPhone: draft.vendorPhone,
        receiptNumber: draft.receiptNumber,
        date: draft.date ?? new Date(),
        time: draft.time,
        paymentMethod: draft.paymentMethod,
        cardLast4: draft.cardLast4,
        subtotal: fromCents(draft.subtotalCents),
        discountTotal: draft.discountCents == null ? null : fromCents(draft.discountCents),
        gstAmount: fromCents(draft.gstCents),
        total: fromCents(draft.totalCents),
        isTaxInvoice: draft.isTaxInvoice,
        category: draft.category,
        notes: draft.notes,
        fileId: opts.fileId,
        rawOcrData: JSON.stringify(opts.raw),
        scanConfidence: draft.confidence,
        scanWarnings: draft.warnings,
      })
      .returning({ id: receipts.id });
    await writeItems(tx, orgId, row.id, draft.items, draft.gstCents);
    return row.id;
  });
}

/** Another receipt with the same total within a day of this one — probably scanned twice. */
export async function findDuplicate(orgId: string, r: { id?: string; date: Date; total: string; vendor: string }) {
  const firstWord = r.vendor.split(/\s+/)[0]?.toLowerCase() ?? "";
  const conds = [
    eq(receipts.orgId, orgId),
    eq(receipts.total, r.total),
    between(receipts.date, addDays(r.date, -1), addDays(r.date, 1)),
    sql`lower(${receipts.vendor}) like ${firstWord + "%"}`,
  ];
  if (r.id) conds.push(ne(receipts.id, r.id));
  const [dup] = await db
    .select({ id: receipts.id, vendor: receipts.vendor, date: receipts.date, status: receipts.status })
    .from(receipts)
    .where(and(...conds))
    .limit(1);
  return dup ?? null;
}
