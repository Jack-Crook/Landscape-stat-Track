"use server";

import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { costLines, files, invoices, jobPhotos, jobs, mileageLogs, receipts } from "@/db/schema";
import { getOrg, requireOrg } from "@/lib/auth";
import {
  checkbox,
  formObject,
  invalid,
  optionalDate,
  optionalMoney,
  optionalNumber,
  optionalText,
  optionalUuid,
  requiredMoney,
  requiredText,
  type FormState,
} from "@/lib/actions";
import { COST_TYPES, JOB_STATUSES } from "@/lib/constants";
import { gstFromInclusive } from "@/lib/gst";
import { fromCents } from "@/lib/money";
import { addDays, addMonths } from "@/lib/periods";
import { recomputeJobTotals } from "@/lib/data/jobs";
import { createInvoice, lineItemsForJob } from "@/lib/data/invoices";
import { ownsClient } from "@/lib/data/ownership";

const jobSchema = z.object({
  name: requiredText("Give the job a name"),
  clientId: optionalUuid,
  category: optionalText,
  siteAddress: optionalText,
  description: optionalText,
  quotedPrice: optionalMoney,
  estimatedCost: optionalMoney,
  startDate: optionalDate,
  endDate: optionalDate,
  hoursWorked: optionalNumber,
  isRecurring: checkbox,
  recurrenceInterval: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["weekly", "fortnightly", "monthly"]).optional()),
});

async function ownedJob(orgId: string, jobId: string) {
  return db.query.jobs.findFirst({ where: and(eq(jobs.id, jobId), eq(jobs.orgId, orgId)) });
}

export async function saveJob(_prev: FormState, formData: FormData): Promise<FormState> {
  const { orgId } = await requireOrg();
  const parsed = jobSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  if (d.startDate && d.endDate && d.endDate < d.startDate) {
    return { ok: false, message: "Check the dates.", errors: { endDate: ["Finishes before it starts"] } };
  }
  if (!(await ownsClient(orgId, d.clientId))) {
    return { ok: false, message: "Client not found", errors: { clientId: ["Pick a client from the list"] } };
  }
  if (d.isRecurring && !d.recurrenceInterval) {
    return { ok: false, message: "Choose how often it repeats.", errors: { recurrenceInterval: ["Pick an interval"] } };
  }

  const values = {
    name: d.name,
    clientId: d.clientId ?? null,
    category: d.category ?? null,
    siteAddress: d.siteAddress ?? null,
    description: d.description ?? null,
    quotedPrice: d.quotedPrice == null ? null : fromCents(d.quotedPrice),
    estimatedCost: d.estimatedCost == null ? null : fromCents(d.estimatedCost),
    startDate: d.startDate ?? null,
    endDate: d.endDate ?? null,
    hoursWorked: d.hoursWorked == null ? null : String(d.hoursWorked),
    isRecurring: d.isRecurring,
    recurrenceInterval: d.isRecurring ? d.recurrenceInterval ?? null : null,
    updatedAt: new Date(),
  };

  const id = formData.get("id");
  let jobId: string;
  if (typeof id === "string" && id) {
    const [row] = await db.update(jobs).set(values).where(and(eq(jobs.id, id), eq(jobs.orgId, orgId))).returning({ id: jobs.id });
    if (!row) return { ok: false, message: "Job not found" };
    jobId = row.id;
  } else {
    const [row] = await db.insert(jobs).values({ ...values, orgId }).returning({ id: jobs.id });
    jobId = row.id;
  }
  await recomputeJobTotals(jobId);
  revalidatePath("/jobs");
  redirect(`/jobs/${jobId}`);
}

export async function deleteJob(formData: FormData) {
  const { orgId } = await requireOrg();
  const id = String(formData.get("id") ?? "");
  if (!(await ownedJob(orgId, id))) return;
  // Photos' stored files aren't reached by the job's cascade; remove them first.
  const photoFiles = await db.select({ fileId: jobPhotos.fileId }).from(jobPhotos).where(eq(jobPhotos.jobId, id));
  const ids = photoFiles.map((p) => p.fileId).filter((x): x is string => !!x);
  if (ids.length) await db.delete(files).where(and(inArray(files.id, ids), eq(files.orgId, orgId)));
  await db.delete(jobs).where(and(eq(jobs.id, id), eq(jobs.orgId, orgId)));
  revalidatePath("/jobs");
  redirect("/jobs");
}

function nextOccurrence(from: Date, interval: string) {
  if (interval === "weekly") return addDays(from, 7);
  if (interval === "fortnightly") return addDays(from, 14);
  return addMonths(from, 1);
}

/**
 * Moves a job along quoted → in progress → completed → invoiced → paid.
 * - completed: stamps completedAt; a recurring job books its next visit.
 * - invoiced: raises an invoice if the job doesn't have one.
 * - paid: marks the job's open invoices paid (or creates a paid one).
 */
export async function updateJobStatus(formData: FormData) {
  const org = await getOrg();
  const parsed = z
    .object({ jobId: z.string().uuid(), status: z.enum(JOB_STATUSES) })
    .safeParse({ jobId: formData.get("jobId"), status: formData.get("status") });
  if (!parsed.success) return;
  const { jobId, status } = parsed.data;
  const job = await ownedJob(org.id, jobId);
  if (!job) return;

  await db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .update(jobs)
      .set({ status, updatedAt: now, completedAt: status === "completed" ? job.completedAt ?? now : job.completedAt })
      .where(eq(jobs.id, jobId));

    const jobInvoices = await tx.select().from(invoices).where(and(eq(invoices.jobId, jobId), inArray(invoices.status, ["draft", "sent", "paid"])));

    if (status === "invoiced") {
      if (jobInvoices.length === 0) {
        await createInvoice(tx, org, {
          jobId,
          clientId: job.clientId,
          lineItems: await lineItemsForJob(tx, job, org.gstRegistered),
          status: "sent",
        });
      } else {
        await tx.update(invoices).set({ status: "sent", sentAt: now, updatedAt: now }).where(and(eq(invoices.jobId, jobId), eq(invoices.status, "draft")));
      }
    }

    if (status === "paid") {
      const open = jobInvoices.filter((i) => i.status !== "paid");
      if (jobInvoices.length === 0) {
        await createInvoice(tx, org, {
          jobId,
          clientId: job.clientId,
          lineItems: await lineItemsForJob(tx, job, org.gstRegistered),
          status: "paid",
          paidAt: now,
        });
      }
      for (const inv of open) {
        await tx
          .update(invoices)
          .set({ status: "paid", paidAt: now, amountPaid: inv.total, sentAt: inv.sentAt ?? now, updatedAt: now })
          .where(eq(invoices.id, inv.id));
      }
    }

    // Recurring: completing a visit books the next one (once).
    if (status === "completed" && job.isRecurring && job.recurrenceInterval) {
      const existing = await tx.query.jobs.findFirst({ where: eq(jobs.parentJobId, job.id) });
      if (!existing) {
        const base = job.startDate ?? now;
        const next = nextOccurrence(base, job.recurrenceInterval);
        await tx.insert(jobs).values({
          orgId: org.id,
          clientId: job.clientId,
          name: job.name,
          description: job.description,
          category: job.category,
          siteAddress: job.siteAddress,
          quotedPrice: job.quotedPrice,
          estimatedCost: job.estimatedCost,
          status: "quoted",
          startDate: next,
          isRecurring: true,
          recurrenceInterval: job.recurrenceInterval,
          parentJobId: job.id,
        });
      }
    }
  });

  await recomputeJobTotals(jobId);
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/invoices");
  revalidatePath("/");
}

const costLineSchema = z.object({
  type: z.enum(COST_TYPES),
  description: optionalText,
  amount: requiredMoney,
  gstInclusive: checkbox,
});

export async function addCostLine(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await getOrg();
  const jobId = String(formData.get("jobId") ?? "");
  if (!(await ownedJob(org.id, jobId))) return { ok: false, message: "Job not found" };
  const parsed = costLineSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const amount = parsed.data.amount;
  // Labour paid to yourself or wages carry no GST; supplier costs usually do.
  const gst = parsed.data.gstInclusive && org.gstRegistered ? gstFromInclusive(amount) : 0;
  await db.insert(costLines).values({
    jobId,
    type: parsed.data.type,
    description: parsed.data.description ?? null,
    amount: fromCents(amount),
    gstAmount: fromCents(gst),
  });
  await recomputeJobTotals(jobId);
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true, message: "Cost added" };
}

export async function deleteCostLine(formData: FormData) {
  const { orgId } = await requireOrg();
  const jobId = String(formData.get("jobId") ?? "");
  if (!(await ownedJob(orgId, jobId))) return;
  await db.delete(costLines).where(and(eq(costLines.id, String(formData.get("id"))), eq(costLines.jobId, jobId)));
  await recomputeJobTotals(jobId);
  revalidatePath(`/jobs/${jobId}`);
}

export async function addMileage(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await getOrg();
  const jobId = String(formData.get("jobId") ?? "");
  if (!(await ownedJob(org.id, jobId))) return { ok: false, message: "Job not found" };
  const parsed = z
    .object({ km: z.coerce.number({ error: "Enter the distance" }).positive("Enter the distance").max(10000), notes: optionalText })
    .safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const rate = Number(org.mileageRate);
  const total = Math.round(parsed.data.km * rate * 100);
  await db.insert(mileageLogs).values({
    jobId,
    km: parsed.data.km.toFixed(2),
    ratePerKm: rate.toFixed(4),
    total: fromCents(total),
    notes: parsed.data.notes ?? null,
  });
  await recomputeJobTotals(jobId);
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true, message: "Trip logged" };
}

export async function deleteMileage(formData: FormData) {
  const { orgId } = await requireOrg();
  const jobId = String(formData.get("jobId") ?? "");
  if (!(await ownedJob(orgId, jobId))) return;
  await db.delete(mileageLogs).where(and(eq(mileageLogs.id, String(formData.get("id"))), eq(mileageLogs.jobId, jobId)));
  await recomputeJobTotals(jobId);
  revalidatePath(`/jobs/${jobId}`);
}

export async function logHours(_prev: FormState, formData: FormData): Promise<FormState> {
  const { orgId } = await requireOrg();
  const jobId = String(formData.get("jobId") ?? "");
  const job = await ownedJob(orgId, jobId);
  if (!job) return { ok: false, message: "Job not found" };
  const parsed = z.object({ hours: z.coerce.number({ error: "Enter hours" }).positive("Enter hours").max(1000) }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const total = Number(job.hoursWorked ?? 0) + parsed.data.hours;
  await db.update(jobs).set({ hoursWorked: total.toFixed(2), updatedAt: new Date() }).where(eq(jobs.id, jobId));
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true, message: `${parsed.data.hours} h added` };
}

export async function linkReceipt(formData: FormData) {
  const { orgId } = await requireOrg();
  const jobId = String(formData.get("jobId") ?? "");
  const receiptId = String(formData.get("receiptId") ?? "");
  if (!receiptId || !(await ownedJob(orgId, jobId))) return;
  await db.update(receipts).set({ jobId, updatedAt: new Date() }).where(and(eq(receipts.id, receiptId), eq(receipts.orgId, orgId)));
  await recomputeJobTotals(jobId);
  revalidatePath(`/jobs/${jobId}`);
}

export async function unlinkReceipt(formData: FormData) {
  const { orgId } = await requireOrg();
  const jobId = String(formData.get("jobId") ?? "");
  const receiptId = String(formData.get("receiptId") ?? "");
  await db.update(receipts).set({ jobId: null, updatedAt: new Date() }).where(and(eq(receipts.id, receiptId), eq(receipts.orgId, orgId), eq(receipts.jobId, jobId)));
  await recomputeJobTotals(jobId);
  revalidatePath(`/jobs/${jobId}`);
}

export async function deletePhoto(formData: FormData) {
  const { orgId } = await requireOrg();
  const jobId = String(formData.get("jobId") ?? "");
  if (!(await ownedJob(orgId, jobId))) return;
  const photo = await db.query.jobPhotos.findFirst({ where: and(eq(jobPhotos.id, String(formData.get("id") ?? "")), eq(jobPhotos.jobId, jobId)) });
  if (!photo) return;
  // Deleting the file cascades to the photo row.
  if (photo.fileId) await db.delete(files).where(and(eq(files.id, photo.fileId), eq(files.orgId, orgId)));
  else await db.delete(jobPhotos).where(eq(jobPhotos.id, photo.id));
  revalidatePath(`/jobs/${jobId}`);
}
