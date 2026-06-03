import { Header } from "@/components/layout/Header";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { requireOrg } from "@/lib/auth";
import { NewJobForm } from "./new-job-form";

export default async function NewJobPage() {
  const { orgId } = await requireOrg();
  const clientOptions = await db.query.clients.findMany({
    where: eq(clients.orgId, orgId),
    orderBy: asc(clients.name),
    columns: { id: true, name: true },
  });

  return (
    <div>
      <Header title="New Job" />
      <div className="p-6 max-w-2xl">
        <NewJobForm clients={clientOptions} />
      </div>
    </div>
  );
}
