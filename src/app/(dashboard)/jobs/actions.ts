"use server";

import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { requireOrg } from "@/lib/auth";

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
  return { ok: true };
}
