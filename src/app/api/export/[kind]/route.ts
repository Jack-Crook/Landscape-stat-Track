import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { clients, invoices, jobs, organisations, receiptItems, receipts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { EXPENSE_CATEGORY_LABELS, JOB_STATUS_LABELS } from "@/lib/constants";
import { toCsv } from "@/lib/csv";
import { basisOf, loadLedger } from "@/lib/data/ledger";
import { expenseBreakdown } from "@/lib/data/expenses";
import { summarisePeriod } from "@/lib/finance";
import { fromCents, toCents } from "@/lib/money";
import { addDays, fyRange, fyStartYear, parseDateOnly, toDateInput } from "@/lib/periods";

/** GET /api/export/{receipts|items|invoices|jobs|pl}?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const current = await getCurrentUser();
  if (!current) return new Response("Unauthorized", { status: 401 });
  const { kind } = await ctx.params;
  const url = new URL(req.url);
  const fy = fyRange(fyStartYear(new Date()));
  const from = parseDateOnly(url.searchParams.get("from")) ?? fy.start;
  const toIncl = parseDateOnly(url.searchParams.get("to"));
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = toIncl ? addDays(new Date(toIncl.getFullYear(), toIncl.getMonth(), toIncl.getDate()), 1) : fy.end;
  const orgId = current.orgId;
  const org = await db.query.organisations.findFirst({ where: eq(organisations.id, orgId) });
  if (!org) return new Response("Not found", { status: 404 });

  let csv: string;
  switch (kind) {
    case "receipts": {
      const rows = await db
        .select({ r: receipts, jobName: jobs.name })
        .from(receipts)
        .leftJoin(jobs, eq(jobs.id, receipts.jobId))
        .where(and(eq(receipts.orgId, orgId), eq(receipts.status, "confirmed"), gte(receipts.date, start), lt(receipts.date, end)))
        .orderBy(asc(receipts.date));
      csv = toCsv(
        ["Date", "Supplier", "Branch", "ABN", "Receipt no.", "Category", "Job", "Total (inc GST)", "GST", "Ex GST", "Capital", "Payment", "Notes"],
        rows.map(({ r, jobName }) => [
          toDateInput(r.date), r.vendor, r.vendorBranch, r.vendorAbn, r.receiptNumber, EXPENSE_CATEGORY_LABELS[r.category ?? ""] ?? r.category, jobName,
          r.total, r.gstAmount, fromCents(toCents(r.total) - toCents(r.gstAmount)), r.isCapital ? "Yes" : "No", r.paymentMethod, r.notes,
        ])
      );
      break;
    }
    case "items": {
      const rows = await db
        .select({ i: receiptItems, date: receipts.date, vendor: receipts.vendor, jobName: jobs.name })
        .from(receiptItems)
        .innerJoin(receipts, eq(receipts.id, receiptItems.receiptId))
        .leftJoin(jobs, eq(jobs.id, receipts.jobId))
        .where(and(eq(receiptItems.orgId, orgId), eq(receipts.status, "confirmed"), gte(receipts.date, start), lt(receipts.date, end)))
        .orderBy(asc(receipts.date), asc(receiptItems.position));
      csv = toCsv(
        ["Date", "Supplier", "Item", "As printed", "Brand", "SKU", "Category", "Qty", "Unit", "Unit price", "Total (inc GST)", "GST", "GST-free", "Job"],
        rows.map(({ i, date, vendor, jobName }) => [
          toDateInput(date), vendor, i.itemName, i.description, i.brand, i.sku, EXPENSE_CATEGORY_LABELS[i.category] ?? i.category, Number(i.quantity), i.unit,
          i.unitPrice == null ? "" : Number(i.unitPrice).toFixed(2), i.total, i.gstAmount, i.gstFree ? "Yes" : "No", jobName,
        ])
      );
      break;
    }
    case "invoices": {
      const rows = await db
        .select({ inv: invoices, clientName: clients.name })
        .from(invoices)
        .leftJoin(clients, eq(clients.id, invoices.clientId))
        .where(and(eq(invoices.orgId, orgId), gte(invoices.issueDate, start), lt(invoices.issueDate, end)))
        .orderBy(asc(invoices.issueDate));
      csv = toCsv(
        ["Number", "Issued", "Due", "Client", "Status", "Subtotal", "GST", "Total", "Paid on"],
        rows.map(({ inv, clientName }) => [inv.number, toDateInput(inv.issueDate), toDateInput(inv.dueDate), clientName, inv.status, inv.subtotal, inv.gstAmount, inv.total, toDateInput(inv.paidAt)])
      );
      break;
    }
    case "jobs": {
      const rows = await db
        .select({ j: jobs, clientName: clients.name })
        .from(jobs)
        .leftJoin(clients, eq(clients.id, jobs.clientId))
        .where(eq(jobs.orgId, orgId))
        .orderBy(asc(jobs.startDate));
      csv = toCsv(
        ["Job", "Client", "Category", "Status", "Start", "Completed", "Price (inc GST)", "Expected costs", "Actual costs (ex GST)", "Profit (ex GST)", "Hours"],
        rows
          .filter(({ j }) => {
            const d = j.completedAt ?? j.startDate ?? j.createdAt;
            return d >= start && d < end;
          })
          .map(({ j, clientName }) => [j.name, clientName, j.category, JOB_STATUS_LABELS[j.status], toDateInput(j.startDate), toDateInput(j.completedAt), j.quotedPrice, j.estimatedCost, j.actualCost, j.profit, j.hoursWorked])
      );
      break;
    }
    case "pl": {
      const ledger = await loadLedger(orgId);
      const s = summarisePeriod({ ...ledger, range: { start, end }, basis: basisOf(org), gstRegistered: org.gstRegistered });
      const b = await expenseBreakdown(orgId, { start, end }, org.gstRegistered, ledger);
      csv = toCsv(
        ["Line", "Amount", "Note"],
        [
          ["Period", `${toDateInput(start)} to ${toDateInput(addDays(end, -1))}`, `${basisOf(org)} basis`],
          ["Income (ex GST)", fromCents(s.salesEx), ""],
          ...b.lines.map((l) => [l.label, fromCents(l.amount), l.deductible ? "" : "Not deductible"]),
          ["Total deductible expenses", fromCents(s.expenses), ""],
          ["Net profit", fromCents(s.profit), ""],
          ["GST collected (1A)", fromCents(s.salesGst), ""],
          ["GST credits (1B)", fromCents(s.gstCredits), ""],
          ["Net GST", fromCents(s.netGst), s.netGst >= 0 ? "Payable" : "Refund"],
        ]
      );
      break;
    }
    default:
      return new Response("Not found", { status: 404 });
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}-${toDateInput(start)}-to-${toDateInput(addDays(end, -1))}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
