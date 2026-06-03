import { Header } from "@/components/layout/Header";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { requireOrg } from "@/lib/auth";
import { NewReceiptForm } from "./new-receipt-form";

export default async function NewReceiptPage() {
  const { orgId } = await requireOrg();
  const jobOptions = await db.query.jobs.findMany({
    where: eq(jobs.orgId, orgId),
    orderBy: asc(jobs.name),
    columns: { id: true, name: true },
  });

  return (
    <div>
      <Header title="Log Receipt" />
      <div className="p-6 max-w-2xl">
        <NewReceiptForm jobs={jobOptions} />
      </div>
    </div>
  );
}
