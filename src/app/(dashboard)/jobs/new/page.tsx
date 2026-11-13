import { getOrg } from "@/lib/auth";
import { clientOptions, jobCategoryOptions } from "@/lib/data/lookups";
import { toDateInput } from "@/lib/periods";
import { Page, PageHeader } from "@/components/kit/ui";
import { JobForm } from "../job-form";

export const metadata = { title: "New job" };

export default async function NewJobPage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const org = await getOrg();
  const { clientId } = await searchParams;
  const [clients, categories] = await Promise.all([clientOptions(org.id), jobCategoryOptions(org.id)]);
  const client = clients.find((c) => c.id === clientId);
  return (
    <Page>
      <PageHeader title="New job" back={{ href: "/jobs", label: "Jobs" }} />
      <JobForm
        job={{ clientId: client?.id, siteAddress: client?.address, startDate: toDateInput(new Date()) }}
        clients={clients}
        categories={categories}
        gstRegistered={org.gstRegistered}
      />
    </Page>
  );
}
