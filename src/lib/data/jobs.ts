import "server-only";
import { and, eq } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { costLines, invoices, jobs, mileageLogs, organisations, receipts } from "@/db/schema";
import { jobFinancials } from "@/lib/finance";
import { fromCents } from "@/lib/money";

type Conn = typeof db | Tx;

/**
 * Recomputes a job's cached `actualCost` and `profit` (both GST-exclusive) from
 * its cost lines, mileage, confirmed receipts and invoices. Call after anything
 * that changes a job's money. Reports read the live calculation; the cached
 * columns keep lists fast.
 */
export async function recomputeJobTotals(jobId: string, conn: Conn = db) {
  const job = await conn.query.jobs.findFirst({ where: eq(jobs.id, jobId) });
  if (!job) return;
  const [lines, miles, recs, invs, org] = await Promise.all([
    conn.select().from(costLines).where(eq(costLines.jobId, jobId)),
    conn.select().from(mileageLogs).where(eq(mileageLogs.jobId, jobId)),
    conn
      .select({ status: receipts.status, total: receipts.total, gstAmount: receipts.gstAmount })
      .from(receipts)
      .where(and(eq(receipts.jobId, jobId), eq(receipts.status, "confirmed"))),
    conn.select({ status: invoices.status, total: invoices.total }).from(invoices).where(eq(invoices.jobId, jobId)),
    conn.query.organisations.findFirst({ where: eq(organisations.id, job.orgId), columns: { gstRegistered: true } }),
  ]);

  const f = jobFinancials({
    quotedPrice: job.quotedPrice,
    invoices: invs,
    costLines: lines,
    mileage: miles,
    receipts: recs,
    gstRegistered: org?.gstRegistered ?? true,
  });

  await conn
    .update(jobs)
    .set({
      actualCost: fromCents(f.costs.total),
      profit: f.hasPrice ? fromCents(f.profit) : null,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, jobId));
}

/** Recompute every job in an org (after a GST-registration change, say). */
export async function recomputeAllJobs(orgId: string) {
  const rows = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.orgId, orgId));
  for (const r of rows) await recomputeJobTotals(r.id);
}

/** Fetches one job with everything the detail page shows. Null if not in this org. */
export async function getJobDetail(orgId: string, jobId: string) {
  const job = await db.query.jobs.findFirst({
    where: and(eq(jobs.id, jobId), eq(jobs.orgId, orgId)),
    with: {
      client: true,
      costLines: { orderBy: (c, { desc }) => desc(c.createdAt) },
      mileageLogs: { orderBy: (m, { desc }) => desc(m.createdAt) },
      receipts: { orderBy: (r, { desc }) => desc(r.date) },
      invoices: { orderBy: (i, { desc }) => desc(i.createdAt) },
      quotes: { columns: { id: true, number: true, title: true, total: true, status: true } },
      photos: { orderBy: (p, { desc }) => desc(p.createdAt) },
    },
  });
  return job ?? null;
}
