import "server-only";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { clients, jobCategories, jobs } from "@/db/schema";
import { DEFAULT_JOB_CATEGORIES } from "@/lib/constants";

export async function clientOptions(orgId: string) {
  return db
    .select({ id: clients.id, name: clients.name, address: clients.address })
    .from(clients)
    .where(eq(clients.orgId, orgId))
    .orderBy(asc(clients.name));
}

/** Configured categories plus any free-typed ones already used on jobs. */
export async function jobCategoryOptions(orgId: string) {
  const [configured, used] = await Promise.all([
    db.select({ name: jobCategories.name }).from(jobCategories).where(eq(jobCategories.orgId, orgId)).orderBy(asc(jobCategories.name)),
    db.selectDistinct({ name: jobs.category }).from(jobs).where(eq(jobs.orgId, orgId)),
  ]);
  const names = new Set<string>(configured.length ? configured.map((c) => c.name) : DEFAULT_JOB_CATEGORIES);
  for (const u of used) if (u.name) names.add(u.name);
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Open jobs (not paid) for linking receipts. Most recent first. */
export async function jobOptions(orgId: string) {
  return db
    .select({ id: jobs.id, name: jobs.name, status: jobs.status })
    .from(jobs)
    .where(and(eq(jobs.orgId, orgId), ne(jobs.status, "paid")))
    .orderBy(desc(jobs.updatedAt))
    .limit(100);
}

export async function allJobOptions(orgId: string) {
  return db
    .select({ id: jobs.id, name: jobs.name, status: jobs.status })
    .from(jobs)
    .where(eq(jobs.orgId, orgId))
    .orderBy(desc(jobs.updatedAt))
    .limit(300);
}
