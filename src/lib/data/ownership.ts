import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, files, jobs } from "@/db/schema";

/**
 * Foreign ids arrive from forms, so they're checked against the org before
 * being stored — otherwise a guessed UUID could pull another business's client
 * onto your invoice PDF.
 */
export async function ownsClient(orgId: string, clientId: string | null | undefined) {
  if (!clientId) return true;
  return !!(await db.query.clients.findFirst({ where: and(eq(clients.id, clientId), eq(clients.orgId, orgId)), columns: { id: true } }));
}

export async function ownsJob(orgId: string, jobId: string | null | undefined) {
  if (!jobId) return true;
  return !!(await db.query.jobs.findFirst({ where: and(eq(jobs.id, jobId), eq(jobs.orgId, orgId)), columns: { id: true } }));
}

export async function ownsFile(orgId: string, fileId: string | null | undefined) {
  if (!fileId) return true;
  return !!(await db.query.files.findFirst({ where: and(eq(files.id, fileId), eq(files.orgId, orgId)), columns: { id: true } }));
}
