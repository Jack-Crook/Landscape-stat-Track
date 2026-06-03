import { Header } from "@/components/layout/Header";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { requireOrg } from "@/lib/auth";
import { NewQuoteForm } from "./new-quote-form";

export default async function NewQuotePage() {
  const { orgId } = await requireOrg();
  const clientOptions = await db.query.clients.findMany({
    where: eq(clients.orgId, orgId),
    orderBy: asc(clients.name),
    columns: { id: true, name: true },
  });

  return (
    <div>
      <Header title="New Quote" />
      <div className="p-6 max-w-3xl">
        <NewQuoteForm clients={clientOptions} />
      </div>
    </div>
  );
}
