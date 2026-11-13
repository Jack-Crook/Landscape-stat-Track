import { getOrg } from "@/lib/auth";
import { allJobOptions } from "@/lib/data/lookups";
import { toDateInput } from "@/lib/periods";
import { Page, PageHeader } from "@/components/kit/ui";
import { ReceiptEditor } from "../receipt-editor";

export const metadata = { title: "Add receipt" };

export default async function NewReceiptPage({ searchParams }: { searchParams: Promise<{ jobId?: string }> }) {
  const org = await getOrg();
  const { jobId } = await searchParams;
  const jobs = await allJobOptions(org.id);
  return (
    <Page>
      <PageHeader title="Add receipt" subtitle="Type it in. No photo needed." back={{ href: "/receipts", label: "Receipts" }} />
      <ReceiptEditor
        receipt={{
          vendor: "",
          date: toDateInput(new Date()),
          total: "",
          gstAmount: "",
          category: "materials",
          jobId: jobs.some((j) => j.id === jobId) ? jobId : null,
          isCapital: false,
          items: [],
        }}
        jobs={jobs}
        gstRegistered={org.gstRegistered}
        hasMoreToReview={false}
      />
    </Page>
  );
}
