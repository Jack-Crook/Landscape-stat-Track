"use server";

import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { receipts } from "@/db/schema";
import { requireOrg } from "@/lib/auth";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);
const money = /^\d+(\.\d{1,2})?$/;

const createReceiptSchema = z.object({
  vendor: z.string().trim().min(1, "Vendor is required"),
  date: z.string().min(1, "Date is required"),
  total: z.string().regex(money, "Enter a valid amount"),
  gstAmount: z.preprocess(emptyToUndefined, z.string().regex(money, "Invalid GST").optional()),
  category: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  jobId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  notes: z.preprocess(emptyToUndefined, z.string().trim().optional()),
});

export type CreateReceiptState = {
  errors?: Record<string, string[]>;
  message?: string;
};

/** Lists every receipt for the current org, newest first, with linked job name. */
export async function listReceipts() {
  const { orgId } = await requireOrg();
  return db.query.receipts.findMany({
    where: eq(receipts.orgId, orgId),
    orderBy: desc(receipts.date),
    with: { job: { columns: { id: true, name: true } } },
  });
}

/**
 * Logs a receipt manually (OCR path deferred). GST defaults to the 1/11 of total
 * if left blank, matching AU GST-inclusive pricing. Returns `{ errors }` for
 * `useActionState`; on success revalidates and redirects to the list.
 */
export async function createReceipt(
  _prevState: CreateReceiptState,
  formData: FormData
): Promise<CreateReceiptState> {
  const { orgId } = await requireOrg();

  const parsed = createReceiptSchema.safeParse({
    vendor: formData.get("vendor"),
    date: formData.get("date"),
    total: formData.get("total"),
    gstAmount: formData.get("gstAmount"),
    category: formData.get("category"),
    jobId: formData.get("jobId"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const data = parsed.data;
  const total = Number(data.total);
  // Default GST to the 1/11 component of a GST-inclusive total if not supplied.
  const gstAmount = data.gstAmount ?? (total - total / 1.1).toFixed(2);
  const subtotal = (total - Number(gstAmount)).toFixed(2);

  await db.insert(receipts).values({
    orgId,
    jobId: data.jobId ?? null,
    vendor: data.vendor,
    date: new Date(data.date),
    subtotal,
    gstAmount,
    total: total.toFixed(2),
    category: data.category ?? null,
    notes: data.notes ?? null,
  });

  revalidatePath("/receipts");
  redirect("/receipts");
}
