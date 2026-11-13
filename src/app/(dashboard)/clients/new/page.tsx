import { Page, PageHeader } from "@/components/kit/ui";
import { ClientForm } from "../client-form";

export const metadata = { title: "New client" };

export default async function NewClientPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const { returnTo } = await searchParams;
  return (
    <Page>
      <PageHeader title="New client" back={{ href: returnTo ?? "/clients", label: "Back" }} />
      <ClientForm returnTo={returnTo} />
    </Page>
  );
}
