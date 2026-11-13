import "server-only";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { receiptItems, receipts } from "@/db/schema";
import { COST_TYPE_LABELS, EXPENSE_CATEGORY_LABELS, isDeductibleCategory } from "@/lib/constants";
import { toCents } from "@/lib/money";
import { inRange } from "@/lib/periods";
import type { Ledger } from "./ledger";

export type ExpenseLine = { key: string; label: string; amount: number; gst: number; deductible: boolean };

/**
 * Expenses for a period grouped for a profit & loss statement. Amounts are
 * GST-exclusive when registered (the GST is a credit, not a cost).
 * Receipts with line items split by item category; receipts without items use
 * the receipt's own category. Manual job costs and mileage get their own lines.
 */
export async function expenseBreakdown(orgId: string, range: { start: Date; end: Date }, gstRegistered: boolean, ledger: Ledger) {
  const scope = and(eq(receipts.orgId, orgId), eq(receipts.status, "confirmed"), gte(receipts.date, range.start), lt(receipts.date, range.end));
  const [itemRows, bareRows, itemisedReceipts] = await Promise.all([
    db
      .select({
        category: receiptItems.category,
        total: sql<string>`coalesce(sum(${receiptItems.total}), 0)`,
        gst: sql<string>`coalesce(sum(${receiptItems.gstAmount}), 0)`,
      })
      .from(receiptItems)
      .innerJoin(receipts, eq(receipts.id, receiptItems.receiptId))
      .where(scope)
      .groupBy(receiptItems.category),
    db
      .select({
        category: receipts.category,
        total: sql<string>`coalesce(sum(${receipts.total}), 0)`,
        gst: sql<string>`coalesce(sum(${receipts.gstAmount}), 0)`,
      })
      .from(receipts)
      .where(and(scope, sql`not exists (select 1 from ${receiptItems} where ${receiptItems.receiptId} = ${receipts.id})`))
      .groupBy(receipts.category),
    db
      .select({
        total: sql<string>`coalesce(sum(${receipts.total}), 0)`,
        gst: sql<string>`coalesce(sum(${receipts.gstAmount}), 0)`,
      })
      .from(receipts)
      .where(and(scope, sql`exists (select 1 from ${receiptItems} where ${receiptItems.receiptId} = ${receipts.id})`)),
  ]);

  const lines = new Map<string, ExpenseLine>();
  const add = (key: string, label: string, inc: number, gst: number, deductible: boolean) => {
    const l = lines.get(key) ?? { key, label, amount: 0, gst: 0, deductible };
    // GST is only a credit on deductible spending; on food etc. it's part of the cost.
    l.amount += gstRegistered && deductible ? inc - gst : inc;
    l.gst += gst;
    lines.set(key, l);
  };
  for (const r of [...itemRows, ...bareRows]) {
    const cat = r.category ?? "other";
    add(cat, EXPENSE_CATEGORY_LABELS[cat] ?? cat, toCents(r.total), toCents(r.gst), isDeductibleCategory(cat));
  }
  // Receipts whose items don't add up to the receipt total: keep the statement
  // equal to the receipts' real totals with an explicit balancing line.
  const itemsInc = itemRows.reduce((t, r) => t + toCents(r.total), 0);
  const itemsGst = itemRows.reduce((t, r) => t + toCents(r.gst), 0);
  const diffInc = toCents(itemisedReceipts[0]?.total) - itemsInc;
  const diffGst = toCents(itemisedReceipts[0]?.gst) - itemsGst;
  if (diffInc !== 0 || diffGst !== 0) add("unitemised", "Receipt amounts not split into items", diffInc, diffGst, true);

  for (const c of ledger.costLines) {
    if (!inRange(c.createdAt, range)) continue;
    add(`cost:${c.type}`, `Job ${COST_TYPE_LABELS[c.type]?.toLowerCase() ?? c.type} (logged on jobs)`, toCents(c.amount), toCents(c.gstAmount), true);
  }
  let km = 0;
  let mileage = 0;
  for (const m of ledger.mileage) {
    if (!inRange(m.createdAt, range)) continue;
    km += Number(m.km);
    mileage += toCents(m.total);
  }
  if (mileage > 0) lines.set("mileage", { key: "mileage", label: `Vehicle (${Math.round(km).toLocaleString("en-AU")} km at cents per km)`, amount: mileage, gst: 0, deductible: true });

  const all = [...lines.values()].sort((a, b) => b.amount - a.amount);
  return {
    lines: all,
    deductible: all.filter((l) => l.deductible).reduce((s, l) => s + l.amount, 0),
    nonDeductible: all.filter((l) => !l.deductible).reduce((s, l) => s + l.amount, 0),
    km,
  };
}
