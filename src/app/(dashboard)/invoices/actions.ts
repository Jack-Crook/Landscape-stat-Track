"use server";

import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { invoices, jobs } from "@/db/schema";
import { getOrg, requireOrg } from "@/lib/auth";
import { formObject, invalid, optionalDate, optionalText, optionalUuid, requiredDate, type FormState } from "@/lib/actions";
import { lineItemTotals } from "@/lib/gst";
import { lineItemsField } from "@/lib/line-items";
import { fromCents } from "@/lib/money";
import { createInvoice } from "@/lib/data/invoices";
import { recomputeJobTotals } from "@/lib/data/jobs";
import { ownsClient, ownsJob } from "@/lib/data/ownership";

const invoiceSchema = z.object({
  clientId: optionalUuid,
  jobId: optionalUuid,
  issueDate: requiredDate,
  dueDate: optionalDate,
  notes: optionalText,
  lineItems: lineItemsField,
});

function touch(jobId?: string | null) {
  revalidatePath("/invoices");
  revalidatePath("/");
  if (jobId) revalidatePath(`/jobs/${jobId}`);
}

/** Moves a job's status to match its invoices (sent → invoiced, all paid → paid). */
async function syncJobStatus(jobId: string | null) {
  if (!jobId) return;
  const rows = await db.select({ status: invoices.status }).from(invoices).where(and(eq(invoices.jobId, jobId), ne(invoices.status, "void")));
  if (rows.length === 0) return;
  const status = rows.every((r) => r.status === "paid") ? "paid" : rows.some((r) => r.status === "sent" || r.status === "paid") ? "invoiced" : null;
  if (status) await db.update(jobs).set({ status, updatedAt: new Date() }).where(eq(jobs.id, jobId));
  await recomputeJobTotals(jobId);
}

export async function saveInvoice(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await getOrg();
  const parsed = invoiceSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  if (d.dueDate && d.dueDate < d.issueDate) return { ok: false, errors: { dueDate: ["Due before it's issued"] }, message: "Check the dates." };

  if (!(await ownsJob(org.id, d.jobId))) return { ok: false, message: "Job not found" };
  if (!(await ownsClient(org.id, d.clientId))) return { ok: false, message: "Client not found" };

  const id = formData.get("id");
  let invoiceId: string;
  if (typeof id === "string" && id) {
    const existing = await db.query.invoices.findFirst({ where: and(eq(invoices.id, id), eq(invoices.orgId, org.id)) });
    if (!existing) return { ok: false, message: "Invoice not found" };
    if (existing.status === "paid" || existing.status === "void") return { ok: false, message: "Paid or void invoices can't be edited. Mark it unpaid first." };
    const totals = lineItemTotals(d.lineItems, org.gstRegistered);
    await db
      .update(invoices)
      .set({
        clientId: d.clientId ?? null,
        jobId: d.jobId ?? null,
        issueDate: d.issueDate,
        dueDate: d.dueDate ?? null,
        notes: d.notes ?? null,
        lineItems: d.lineItems,
        subtotal: fromCents(totals.subtotal),
        gstAmount: fromCents(totals.gst),
        total: fromCents(totals.total),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, id));
    invoiceId = id;
    if (existing.jobId && existing.jobId !== d.jobId) await syncJobStatus(existing.jobId);
  } else {
    const row = await db.transaction((tx) =>
      createInvoice(tx, org, {
        clientId: d.clientId ?? null,
        jobId: d.jobId ?? null,
        lineItems: d.lineItems,
        issueDate: d.issueDate,
        dueDate: d.dueDate,
        notes: d.notes ?? null,
        status: "draft",
      })
    );
    invoiceId = row.id;
  }
  await syncJobStatus(d.jobId ?? null);
  touch(d.jobId);
  redirect(`/invoices/${invoiceId}`);
}

async function owned(orgId: string, id: string) {
  return db.query.invoices.findFirst({ where: and(eq(invoices.id, id), eq(invoices.orgId, orgId)) });
}

export async function markInvoiceSent(formData: FormData) {
  const { orgId } = await requireOrg();
  const inv = await owned(orgId, String(formData.get("id") ?? ""));
  if (!inv || inv.status !== "draft") return;
  await db.update(invoices).set({ status: "sent", sentAt: new Date(), updatedAt: new Date() }).where(eq(invoices.id, inv.id));
  await syncJobStatus(inv.jobId);
  touch(inv.jobId);
  revalidatePath(`/invoices/${inv.id}`);
}

export async function recordPayment(_prev: FormState, formData: FormData): Promise<FormState> {
  const { orgId } = await requireOrg();
  const inv = await owned(orgId, String(formData.get("id") ?? ""));
  if (!inv) return { ok: false, message: "Invoice not found" };
  const parsed = z.object({ paidAt: requiredDate }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  if (parsed.data.paidAt > new Date(Date.now() + 86_400_000)) return { ok: false, errors: { paidAt: ["That's in the future"] } };
  await db
    .update(invoices)
    .set({ status: "paid", paidAt: parsed.data.paidAt, amountPaid: inv.total, sentAt: inv.sentAt ?? new Date(), updatedAt: new Date() })
    .where(eq(invoices.id, inv.id));
  await syncJobStatus(inv.jobId);
  touch(inv.jobId);
  revalidatePath(`/invoices/${inv.id}`);
  return { ok: true, message: "Payment recorded" };
}

export async function markUnpaid(formData: FormData) {
  const { orgId } = await requireOrg();
  const inv = await owned(orgId, String(formData.get("id") ?? ""));
  if (!inv || inv.status !== "paid") return;
  await db.update(invoices).set({ status: "sent", paidAt: null, amountPaid: "0", updatedAt: new Date() }).where(eq(invoices.id, inv.id));
  if (inv.jobId) await db.update(jobs).set({ status: "invoiced", updatedAt: new Date() }).where(eq(jobs.id, inv.jobId));
  touch(inv.jobId);
  revalidatePath(`/invoices/${inv.id}`);
}

export async function voidInvoice(formData: FormData) {
  const { orgId } = await requireOrg();
  const inv = await owned(orgId, String(formData.get("id") ?? ""));
  if (!inv) return;
  if (inv.status === "draft") {
    // Drafts were never issued: delete instead of leaving a void in the sequence.
    await db.delete(invoices).where(eq(invoices.id, inv.id));
    if (inv.jobId) await recomputeJobTotals(inv.jobId);
    touch(inv.jobId);
    redirect("/invoices");
  }
  await db.update(invoices).set({ status: "void", updatedAt: new Date() }).where(eq(invoices.id, inv.id));
  if (inv.jobId) await recomputeJobTotals(inv.jobId);
  touch(inv.jobId);
  revalidatePath(`/invoices/${inv.id}`);
}
