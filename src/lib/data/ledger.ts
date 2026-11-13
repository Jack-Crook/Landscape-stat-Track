import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { costLines, invoices, jobs, mileageLogs, receiptItems, receipts } from "@/db/schema";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import type { Basis } from "@/lib/finance";
import { toCents } from "@/lib/money";

const NON_DEDUCTIBLE = EXPENSE_CATEGORIES.filter((c) => "deductible" in c && c.deductible === false).map(
  (c) => c.key as string
);

/**
 * Everything the money reports need for one org, in the shapes src/lib/finance.ts
 * expects. A small trade business has hundreds to a few thousand rows a year, so
 * loading and summarising in memory keeps the maths in one tested place.
 */
export async function loadLedger(orgId: string) {
  const ndList = sql.join(NON_DEDUCTIBLE.map((k) => sql`${k}`), sql`, `);
  const [invoiceRows, receiptRows, costRows, mileageRows] = await Promise.all([
    db
      .select({
        id: invoices.id,
        status: invoices.status,
        issueDate: invoices.issueDate,
        paidAt: invoices.paidAt,
        dueDate: invoices.dueDate,
        total: invoices.total,
        gstAmount: invoices.gstAmount,
        clientId: invoices.clientId,
        jobId: invoices.jobId,
      })
      .from(invoices)
      .where(eq(invoices.orgId, orgId)),
    db
      .select({
        id: receipts.id,
        status: receipts.status,
        date: receipts.date,
        total: receipts.total,
        gstAmount: receipts.gstAmount,
        isCapital: receipts.isCapital,
        category: receipts.category,
        jobId: receipts.jobId,
        vendor: receipts.vendor,
        itemCount: sql<number>`count(${receiptItems.id})::int`,
        nd: sql<string>`coalesce(sum(case when ${receiptItems.category} in (${ndList}) then ${receiptItems.total} else 0 end), 0)`,
        ndGst: sql<string>`coalesce(sum(case when ${receiptItems.category} in (${ndList}) then ${receiptItems.gstAmount} else 0 end), 0)`,
      })
      .from(receipts)
      .leftJoin(receiptItems, eq(receiptItems.receiptId, receipts.id))
      .where(and(eq(receipts.orgId, orgId), eq(receipts.status, "confirmed")))
      .groupBy(receipts.id),
    db
      .select({
        createdAt: costLines.createdAt,
        amount: costLines.amount,
        gstAmount: costLines.gstAmount,
        type: costLines.type,
        jobId: costLines.jobId,
      })
      .from(costLines)
      .innerJoin(jobs, eq(jobs.id, costLines.jobId))
      .where(eq(jobs.orgId, orgId)),
    db
      .select({ createdAt: mileageLogs.createdAt, total: mileageLogs.total, km: mileageLogs.km, jobId: mileageLogs.jobId })
      .from(mileageLogs)
      .innerJoin(jobs, eq(jobs.id, mileageLogs.jobId))
      .where(eq(jobs.orgId, orgId)),
  ]);

  const receiptsOut = receiptRows.map((r) => {
    // A receipt with no items whose own category is non-deductible is wholly non-deductible.
    const whole = r.itemCount === 0 && NON_DEDUCTIBLE.includes(r.category ?? "");
    return {
      ...r,
      nonDeductibleCents: whole ? toCents(r.total) : toCents(r.nd),
      nonDeductibleGstCents: whole ? toCents(r.gstAmount) : toCents(r.ndGst),
    };
  });

  return { invoices: invoiceRows, receipts: receiptsOut, costLines: costRows, mileage: mileageRows };
}

export type Ledger = Awaited<ReturnType<typeof loadLedger>>;

export function basisOf(org: { accountingBasis: string }): Basis {
  return org.accountingBasis === "accrual" ? "accrual" : "cash";
}

/** Invoices for a set of jobs, grouped by job id. */
export async function invoicesByJob(orgId: string, jobIds: string[]) {
  if (jobIds.length === 0) return new Map<string, { status: string; total: string }[]>();
  const rows = await db
    .select({ jobId: invoices.jobId, status: invoices.status, total: invoices.total })
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), inArray(invoices.jobId, jobIds)));
  const map = new Map<string, { status: string; total: string }[]>();
  for (const r of rows) {
    if (!r.jobId) continue;
    map.set(r.jobId, [...(map.get(r.jobId) ?? []), r]);
  }
  return map;
}
