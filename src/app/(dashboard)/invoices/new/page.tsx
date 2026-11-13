import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { getOrg } from "@/lib/auth";
import { allJobOptions, clientOptions } from "@/lib/data/lookups";
import { lineItemsForJob } from "@/lib/data/invoices";
import { addDays, toDateInput } from "@/lib/periods";
import { Page, PageHeader } from "@/components/kit/ui";
import { InvoiceForm } from "../invoice-form";

export const metadata = { title: "New invoice" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ jobId?: string; clientId?: string }> }) {
  const org = await getOrg();
  const sp = await searchParams;
  const [clients, jobOpts] = await Promise.all([clientOptions(org.id), allJobOptions(org.id)]);
  const job = sp.jobId ? await db.query.jobs.findFirst({ where: and(eq(jobs.id, sp.jobId), eq(jobs.orgId, org.id)) }) : null;
  const lineItems = job ? await db.transaction((tx) => lineItemsForJob(tx, job, org.gstRegistered)) : undefined;
  const today = new Date();

  return (
    <Page>
      <PageHeader title="New invoice" back={{ href: job ? `/jobs/${job.id}` : "/invoices", label: job ? job.name : "Invoices" }} />
      <InvoiceForm
        invoice={{
          clientId: job?.clientId ?? sp.clientId ?? null,
          jobId: job?.id ?? null,
          issueDate: toDateInput(today),
          dueDate: toDateInput(addDays(today, org.paymentTermsDays)),
          lineItems,
          notes: org.invoiceNotes,
        }}
        clients={clients}
        jobs={jobOpts}
        gstRegistered={org.gstRegistered}
      />
    </Page>
  );
}
