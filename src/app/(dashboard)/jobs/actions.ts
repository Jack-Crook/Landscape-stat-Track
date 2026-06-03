"use server";

import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { jobs, costLines, mileageLogs } from "@/db/schema";
import { requireOrg } from "@/lib/auth";
import { DEFAULT_TAX_RATE, DEFAULT_MILEAGE_RATE } from "@/lib/constants";

// Empty form fields arrive as "" — normalise to undefined so optional() applies.
const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const jobStatuses = [
  "quoted",
  "in_progress",
  "completed",
  "invoiced",
  "paid",
] as const;

const createJobSchema = z.object({
  name: z.string().trim().min(1, "Job name is required"),
  clientId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  category: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  description: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  quotedPrice: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount")
      .optional()
  ),
  startDate: z.preprocess(emptyToUndefined, z.string().optional()),
  endDate: z.preprocess(emptyToUndefined, z.string().optional()),
});

export type CreateJobState = {
  errors?: Record<string, string[]>;
  message?: string;
};

/**
 * Lists every job for the current org, newest first, with its client joined in.
 * Scoped by `requireOrg()` so a tenant only ever sees its own rows.
 */
export async function listJobs() {
  const { orgId } = await requireOrg();
  return db.query.jobs.findMany({
    where: eq(jobs.orgId, orgId),
    orderBy: desc(jobs.createdAt),
    with: { client: { columns: { name: true } } },
  });
}

/**
 * Creates a job from the new-job form. Returns `{ errors }` for `useActionState`
 * when validation fails; on success it revalidates the list and redirects there
 * (redirect throws, so it sits outside any try/catch).
 */
export async function createJob(
  _prevState: CreateJobState,
  formData: FormData
): Promise<CreateJobState> {
  const { orgId } = await requireOrg();

  const parsed = createJobSchema.safeParse({
    name: formData.get("name"),
    clientId: formData.get("clientId"),
    category: formData.get("category"),
    description: formData.get("description"),
    quotedPrice: formData.get("quotedPrice"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
  });

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const data = parsed.data;

  await db.insert(jobs).values({
    orgId,
    name: data.name,
    clientId: data.clientId ?? null,
    category: data.category ?? null,
    description: data.description ?? null,
    quotedPrice: data.quotedPrice ?? null,
    startDate: data.startDate ? new Date(data.startDate) : null,
    endDate: data.endDate ? new Date(data.endDate) : null,
  });

  revalidatePath("/jobs");
  redirect("/jobs");
}

/**
 * Fetches one job (scoped to the org) with its client, cost lines and mileage
 * logs joined in. Returns `null` if the id doesn't belong to this org.
 */
export async function getJob(jobId: string) {
  const { orgId } = await requireOrg();
  const job = await db.query.jobs.findFirst({
    where: and(eq(jobs.id, jobId), eq(jobs.orgId, orgId)),
    with: {
      client: { columns: { id: true, name: true } },
      costLines: { orderBy: desc(costLines.createdAt) },
      mileageLogs: { orderBy: desc(mileageLogs.createdAt) },
    },
  });
  return job ?? null;
}

/**
 * Recomputes and persists a job's `actualCost` (sum of cost lines + mileage
 * totals) and `profit` (quotedPrice − actualCost). Called after any cost/mileage
 * mutation so the job row stays the single source of truth for reporting.
 */
async function recomputeJobTotals(jobId: string) {
  const [lines, miles, job] = await Promise.all([
    db.query.costLines.findMany({ where: eq(costLines.jobId, jobId) }),
    db.query.mileageLogs.findMany({ where: eq(mileageLogs.jobId, jobId) }),
    db.query.jobs.findFirst({ where: eq(jobs.id, jobId) }),
  ]);

  const costTotal =
    lines.reduce((sum, l) => sum + Number(l.amount), 0) +
    miles.reduce((sum, m) => sum + Number(m.total), 0);

  const quoted = job?.quotedPrice != null ? Number(job.quotedPrice) : null;

  await db
    .update(jobs)
    .set({
      actualCost: costTotal.toFixed(2),
      profit: quoted != null ? (quoted - costTotal).toFixed(2) : null,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, jobId));
}

/**
 * Moves a single job along the status pipeline
 * (quoted → in_progress → completed → invoiced → paid). The `orgId` is included
 * in the WHERE so one tenant can never mutate another's job.
 */
export async function updateJobStatus(jobId: string, status: string) {
  const { orgId } = await requireOrg();

  const parsed = z.object({
    jobId: z.string().uuid(),
    status: z.enum(jobStatuses),
  }).safeParse({ jobId, status });

  if (!parsed.success) {
    return { error: "Invalid job or status" };
  }

  await db
    .update(jobs)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(and(eq(jobs.id, parsed.data.jobId), eq(jobs.orgId, orgId)));

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${parsed.data.jobId}`);
  return { ok: true };
}

const costTypes = ["materials", "labour", "travel", "other"] as const;

const costLineSchema = z.object({
  jobId: z.string().uuid(),
  type: z.enum(costTypes),
  description: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount"),
  gstInclusive: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

/**
 * Adds a cost line to a job. If `gstInclusive` is set, the GST component is
 * extracted from the amount (amount − amount/(1+rate)); otherwise GST is 0.
 * Verifies the job belongs to the org before writing, then recomputes totals.
 */
export async function addCostLine(jobId: string, formData: FormData) {
  const { orgId } = await requireOrg();

  const parsed = costLineSchema.safeParse({
    jobId,
    type: formData.get("type"),
    description: formData.get("description"),
    amount: formData.get("amount"),
    gstInclusive: formData.get("gstInclusive"),
  });
  if (!parsed.success) {
    return { error: z.flattenError(parsed.error).fieldErrors };
  }

  const owns = await db.query.jobs.findFirst({
    where: and(eq(jobs.id, jobId), eq(jobs.orgId, orgId)),
    columns: { id: true },
  });
  if (!owns) return { error: { jobId: ["Job not found"] } };

  const amount = Number(parsed.data.amount);
  const gstAmount = parsed.data.gstInclusive
    ? amount - amount / (1 + DEFAULT_TAX_RATE)
    : 0;

  await db.insert(costLines).values({
    jobId,
    type: parsed.data.type,
    description: parsed.data.description ?? null,
    amount: amount.toFixed(2),
    gstAmount: gstAmount.toFixed(2),
  });

  await recomputeJobTotals(jobId);
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}

/** Deletes a cost line (verifying org ownership via its parent job), recomputes totals. */
export async function deleteCostLine(jobId: string, costLineId: string) {
  const { orgId } = await requireOrg();
  const owns = await db.query.jobs.findFirst({
    where: and(eq(jobs.id, jobId), eq(jobs.orgId, orgId)),
    columns: { id: true },
  });
  if (!owns) return { error: "Job not found" };

  await db
    .delete(costLines)
    .where(and(eq(costLines.id, costLineId), eq(costLines.jobId, jobId)));

  await recomputeJobTotals(jobId);
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}

const mileageSchema = z.object({
  jobId: z.string().uuid(),
  km: z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter valid km"),
  notes: z.preprocess(emptyToUndefined, z.string().trim().optional()),
});

/**
 * Logs mileage for a job at the ATO per-km rate (constants), auto-computing the
 * total. Verifies org ownership, then recomputes job totals.
 */
export async function addMileage(jobId: string, formData: FormData) {
  const { orgId } = await requireOrg();

  const parsed = mileageSchema.safeParse({
    jobId,
    km: formData.get("km"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { error: z.flattenError(parsed.error).fieldErrors };
  }

  const owns = await db.query.jobs.findFirst({
    where: and(eq(jobs.id, jobId), eq(jobs.orgId, orgId)),
    columns: { id: true },
  });
  if (!owns) return { error: { jobId: ["Job not found"] } };

  const km = Number(parsed.data.km);
  const total = km * DEFAULT_MILEAGE_RATE;

  await db.insert(mileageLogs).values({
    jobId,
    km: km.toFixed(2),
    ratePerKm: DEFAULT_MILEAGE_RATE.toFixed(4),
    total: total.toFixed(2),
    notes: parsed.data.notes ?? null,
  });

  await recomputeJobTotals(jobId);
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}

/** Deletes a mileage log (verifying org ownership via its parent job), recomputes totals. */
export async function deleteMileage(jobId: string, mileageId: string) {
  const { orgId } = await requireOrg();
  const owns = await db.query.jobs.findFirst({
    where: and(eq(jobs.id, jobId), eq(jobs.orgId, orgId)),
    columns: { id: true },
  });
  if (!owns) return { error: "Job not found" };

  await db
    .delete(mileageLogs)
    .where(and(eq(mileageLogs.id, mileageId), eq(mileageLogs.jobId, jobId)));

  await recomputeJobTotals(jobId);
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}
