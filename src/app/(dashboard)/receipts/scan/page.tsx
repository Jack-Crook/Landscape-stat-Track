import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { getOrg } from "@/lib/auth";
import { scannerMode } from "@/lib/env";
import { LinkButton, Page, PageHeader } from "@/components/kit/ui";
import { Scanner } from "./scanner";

export const metadata = { title: "Scan receipts" };

export default async function ScanPage({ searchParams }: { searchParams: Promise<{ jobId?: string }> }) {
  const org = await getOrg();
  const { jobId } = await searchParams;
  const job = jobId ? await db.query.jobs.findFirst({ where: and(eq(jobs.id, jobId), eq(jobs.orgId, org.id)), columns: { id: true, name: true } }) : null;
  return (
    <Page>
      <PageHeader
        title="Scan receipts"
        back={job ? { href: `/jobs/${job.id}`, label: job.name } : { href: "/receipts", label: "Receipts" }}
        actions={
          <LinkButton href={`/receipts/new${job ? `?jobId=${job.id}` : ""}`} variant="gray">
            Enter by hand
          </LinkButton>
        }
      />
      <Scanner jobId={job?.id} jobName={job?.name} scannerReady={scannerMode() !== "off"} />
    </Page>
  );
}
