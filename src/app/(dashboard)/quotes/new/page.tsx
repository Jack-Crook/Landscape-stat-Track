import { getOrg } from "@/lib/auth";
import { clientOptions, jobCategoryOptions } from "@/lib/data/lookups";
import { categoryMargins } from "@/lib/data/insights";
import { addDays, toDateInput } from "@/lib/periods";
import { Page, PageHeader } from "@/components/kit/ui";
import { QuoteForm } from "../quote-form";

export const metadata = { title: "New quote" };

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const org = await getOrg();
  const { clientId } = await searchParams;
  const [clients, categories, margins] = await Promise.all([
    clientOptions(org.id),
    jobCategoryOptions(org.id),
    categoryMargins(org.id, org.gstRegistered),
  ]);
  return (
    <Page>
      <PageHeader title="New quote" back={{ href: "/quotes", label: "Quotes" }} />
      <QuoteForm
        quote={{ clientId: clients.some((c) => c.id === clientId) ? clientId : undefined, validUntil: toDateInput(addDays(new Date(), 30)) }}
        clients={clients}
        categories={categories}
        gstRegistered={org.gstRegistered}
        categoryMargins={margins}
      />
    </Page>
  );
}
