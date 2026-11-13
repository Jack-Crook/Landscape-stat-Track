import "server-only";
import { and, desc, eq, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { receiptItems, receipts } from "@/db/schema";

/**
 * Item-level spending from scanned receipt lines. Only confirmed receipts count.
 * Item totals are GST-inclusive (what was paid); `gst` is the credit inside.
 */

function scope(orgId: string, range?: { start: Date; end: Date }, extra?: SQL) {
  const conds: SQL[] = [eq(receiptItems.orgId, orgId), eq(receipts.status, "confirmed")];
  if (range) conds.push(gte(receipts.date, range.start), lt(receipts.date, range.end));
  if (extra) conds.push(extra);
  return and(...conds);
}

const totalSql = sql<string>`coalesce(sum(${receiptItems.total}), 0)`;
const gstSql = sql<string>`coalesce(sum(${receiptItems.gstAmount}), 0)`;

export async function spendingByCategory(orgId: string, range?: { start: Date; end: Date }) {
  return db
    .select({
      category: receiptItems.category,
      total: totalSql,
      gst: gstSql,
      lines: sql<number>`count(*)::int`,
    })
    .from(receiptItems)
    .innerJoin(receipts, eq(receipts.id, receiptItems.receiptId))
    .where(scope(orgId, range))
    .groupBy(receiptItems.category)
    .orderBy(desc(totalSql));
}

export async function topItems(
  orgId: string,
  opts: { range?: { start: Date; end: Date }; category?: string; q?: string; limit?: number } = {}
) {
  const filters: SQL[] = [];
  if (opts.category) filters.push(eq(receiptItems.category, opts.category));
  if (opts.q) {
    const like = `%${opts.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    filters.push(or(ilike(receiptItems.itemName, like), ilike(receiptItems.description, like), ilike(receiptItems.brand, like))!);
  }
  return db
    .select({
      itemName: receiptItems.itemName,
      category: sql<string>`mode() within group (order by ${receiptItems.category})`,
      total: totalSql,
      quantity: sql<string>`coalesce(sum(${receiptItems.quantity}), 0)`,
      purchases: sql<number>`count(distinct ${receiptItems.receiptId})::int`,
      avgUnitPrice: sql<string | null>`avg(${receiptItems.unitPrice})`,
      units: sql<number>`count(distinct lower(coalesce(${receiptItems.unit}, 'each')))::int`,
      unit: sql<string | null>`min(${receiptItems.unit})`,
      minUnitPrice: sql<string | null>`min(${receiptItems.unitPrice})`,
      maxUnitPrice: sql<string | null>`max(${receiptItems.unitPrice})`,
      lastBought: sql<Date>`max(${receipts.date})`,
    })
    .from(receiptItems)
    .innerJoin(receipts, eq(receipts.id, receiptItems.receiptId))
    .where(scope(orgId, opts.range, filters.length ? and(...filters) : undefined))
    .groupBy(receiptItems.itemName)
    .orderBy(desc(totalSql))
    .limit(opts.limit ?? 50);
}

export async function topSuppliers(orgId: string, range?: { start: Date; end: Date }, limit = 10) {
  const conds: SQL[] = [eq(receipts.orgId, orgId), eq(receipts.status, "confirmed")];
  if (range) conds.push(gte(receipts.date, range.start), lt(receipts.date, range.end));
  const t = sql<string>`coalesce(sum(${receipts.total}), 0)`;
  return db
    .select({
      vendor: receipts.vendor,
      total: t,
      gst: sql<string>`coalesce(sum(${receipts.gstAmount}), 0)`,
      receipts: sql<number>`count(*)::int`,
      lastVisit: sql<Date>`max(${receipts.date})`,
    })
    .from(receipts)
    .where(and(...conds))
    .groupBy(receipts.vendor)
    .orderBy(desc(t))
    .limit(limit);
}

/** Every purchase of one item, newest first — for the item page. */
export async function itemPurchases(orgId: string, itemName: string) {
  return db
    .select({
      id: receiptItems.id,
      receiptId: receipts.id,
      date: receipts.date,
      vendor: receipts.vendor,
      vendorBranch: receipts.vendorBranch,
      description: receiptItems.description,
      brand: receiptItems.brand,
      category: receiptItems.category,
      quantity: receiptItems.quantity,
      unit: receiptItems.unit,
      unitPrice: receiptItems.unitPrice,
      total: receiptItems.total,
      gst: receiptItems.gstAmount,
      jobId: receipts.jobId,
    })
    .from(receiptItems)
    .innerJoin(receipts, eq(receipts.id, receiptItems.receiptId))
    .where(scope(orgId, undefined, sql`lower(${receiptItems.itemName}) = lower(${itemName})`))
    .orderBy(desc(receipts.date));
}

/** Monthly item spend (GST-inc) for a range — the spending trend chart. */
export async function spendingByMonth(orgId: string, range: { start: Date; end: Date }) {
  const month = sql<string>`to_char(date_trunc('month', ${receipts.date}), 'YYYY-MM')`;
  return db
    .select({ month, total: totalSql })
    .from(receiptItems)
    .innerJoin(receipts, eq(receipts.id, receiptItems.receiptId))
    .where(scope(orgId, range))
    .groupBy(month)
    .orderBy(month);
}

/** All distinct item names, for autocomplete. */
export async function itemNames(orgId: string) {
  const rows = await db
    .selectDistinct({ itemName: receiptItems.itemName })
    .from(receiptItems)
    .where(eq(receiptItems.orgId, orgId))
    .orderBy(receiptItems.itemName);
  return rows.map((r) => r.itemName);
}
