"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { files, jobs, receipts } from "@/db/schema";
import { requireOrg } from "@/lib/auth";
import { checkbox, formObject, invalid, optionalMoney, optionalText, optionalUuid, requiredDate, requiredMoney, requiredText, type FormState } from "@/lib/actions";
import { EXPENSE_CATEGORY_KEYS, PAYMENT_METHODS } from "@/lib/constants";
import { gstFromInclusive } from "@/lib/gst";
import { fromCents, parseAmountInput } from "@/lib/money";
import { normalizeExtraction, normalizeItemName, type DraftItem } from "@/lib/receipts/normalize";
import { extractReceipt, ScanError } from "@/lib/receipts/extract";
import { writeItems } from "@/lib/data/receipts";
import { recomputeJobTotals } from "@/lib/data/jobs";
import { ownsFile } from "@/lib/data/ownership";

const itemSchema = z.object({
  description: z.string().trim().default(""),
  itemName: z.string().trim().default(""),
  category: z.enum(EXPENSE_CATEGORY_KEYS).catch("other"),
  quantity: z.coerce.number().positive().catch(1),
  unitPrice: z.string().default(""),
  total: z.string(),
  gstFree: z.boolean().default(false),
  brand: z.string().nullish(),
  sku: z.string().nullish(),
  unit: z.string().nullish(),
});

const receiptSchema = z.object({
  vendor: requiredText("Who was it from?"),
  vendorBranch: optionalText,
  vendorAbn: z.preprocess((v) => (typeof v === "string" ? v.replace(/\D/g, "") || undefined : v), z.string().length(11, "An ABN is 11 digits").optional()),
  receiptNumber: optionalText,
  date: requiredDate,
  time: optionalText,
  paymentMethod: z.preprocess((v) => (v === "" ? undefined : v), z.enum(PAYMENT_METHODS).optional()),
  cardLast4: optionalText,
  total: requiredMoney,
  gstAmount: optionalMoney,
  category: z.enum(EXPENSE_CATEGORY_KEYS).catch("other"),
  jobId: optionalUuid,
  isCapital: checkbox,
  notes: optionalText,
  items: z
    .string()
    .default("[]")
    .transform((raw, ctx) => {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid items" });
        return z.NEVER;
      }
    })
    .pipe(z.array(itemSchema)),
});

export async function saveReceipt(_prev: FormState, formData: FormData): Promise<FormState> {
  const { orgId } = await requireOrg();
  const parsed = receiptSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const intent = formData.get("intent") === "later" ? "needs_review" : "confirmed";

  if (d.jobId) {
    const job = await db.query.jobs.findFirst({ where: and(eq(jobs.id, d.jobId), eq(jobs.orgId, orgId)), columns: { id: true } });
    if (!job) return { ok: false, message: "Job not found" };
  }

  const items: DraftItem[] = [];
  for (const [n, i] of d.items.entries()) {
    const total = parseAmountInput(i.total);
    if (!i.description && !i.itemName && !total) continue; // blank row
    if (total == null) return { ok: false, message: `Line ${n + 1}: enter an amount.` };
    const unit = parseAmountInput(i.unitPrice);
    items.push({
      description: i.description || i.itemName,
      itemName: normalizeItemName(i.itemName || i.description),
      brand: i.brand ?? null,
      sku: i.sku ?? null,
      category: i.category,
      quantity: i.quantity,
      unit: i.unit ?? null,
      unitPriceCents: unit,
      discountCents: null,
      totalCents: total,
      gstCents: i.gstFree ? 0 : gstFromInclusive(total),
      gstFree: i.gstFree,
    });
  }

  const gst = d.gstAmount ?? items.reduce((s, i) => s + i.gstCents, 0);
  if (gst > Math.round(d.total / 11) + 2) {
    return { ok: false, message: "GST can't be more than 1/11 of the total.", errors: { gstAmount: ["Too high for 10% GST"] } };
  }

  const id = formData.get("id");
  const values = {
    vendor: d.vendor,
    vendorBranch: d.vendorBranch ?? null,
    vendorAbn: d.vendorAbn ?? null,
    receiptNumber: d.receiptNumber ?? null,
    date: d.date,
    time: d.time ?? null,
    paymentMethod: d.paymentMethod ?? null,
    cardLast4: d.cardLast4?.replace(/\D/g, "").slice(-4) || null,
    total: fromCents(d.total),
    gstAmount: fromCents(gst),
    subtotal: fromCents(d.total - gst),
    category: d.category,
    jobId: d.jobId ?? null,
    isCapital: d.isCapital,
    isTaxInvoice: !!d.vendorAbn && gst > 0,
    notes: d.notes ?? null,
    status: intent as "needs_review" | "confirmed",
    updatedAt: new Date(),
  };

  const rawFile = formData.get("fileId");
  const fileId = typeof rawFile === "string" && rawFile && (await ownsFile(orgId, rawFile)) ? rawFile : null;

  let receiptId: string;
  let previousJob: string | null = null;
  if (typeof id === "string" && id) {
    const existing = await db.query.receipts.findFirst({ where: and(eq(receipts.id, id), eq(receipts.orgId, orgId)), columns: { id: true, jobId: true } });
    if (!existing) return { ok: false, message: "Receipt not found" };
    previousJob = existing.jobId;
    await db.transaction(async (tx) => {
      await tx.update(receipts).set({ ...values, scanWarnings: intent === "confirmed" ? [] : undefined }).where(eq(receipts.id, id));
      await writeItems(tx, orgId, id, items, gst);
    });
    receiptId = id;
  } else {
    receiptId = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(receipts)
        .values({ ...values, orgId, fileId })
        .returning({ id: receipts.id });
      await writeItems(tx, orgId, row.id, items, gst);
      return row.id;
    });
  }

  for (const j of new Set([previousJob, d.jobId ?? null])) if (j) await recomputeJobTotals(j);
  revalidatePath("/receipts");
  revalidatePath("/spending");
  revalidatePath("/");
  if (d.jobId) revalidatePath(`/jobs/${d.jobId}`);

  if (intent === "confirmed") {
    // Straight on to the next receipt waiting for review, if any.
    const next = await db.query.receipts.findFirst({
      where: and(eq(receipts.orgId, orgId), eq(receipts.status, "needs_review")),
      columns: { id: true },
      orderBy: (r, { asc }) => asc(r.createdAt),
    });
    if (next && formData.get("continue") === "1") redirect(`/receipts/${next.id}?saved=1`);
  }
  redirect(`/receipts?saved=${receiptId}`);
}

export async function deleteReceipt(formData: FormData) {
  const { orgId } = await requireOrg();
  const id = String(formData.get("id") ?? "");
  const r = await db.query.receipts.findFirst({ where: and(eq(receipts.id, id), eq(receipts.orgId, orgId)) });
  if (!r) return;
  await db.delete(receipts).where(eq(receipts.id, id));
  if (r.fileId) await db.delete(files).where(and(eq(files.id, r.fileId), eq(files.orgId, orgId)));
  if (r.jobId) await recomputeJobTotals(r.jobId);
  revalidatePath("/receipts");
  revalidatePath("/spending");
  redirect("/receipts");
}

/** Reads the stored photo again (e.g. after a failed or poor first scan). */
export async function rescanReceipt(_prev: FormState, formData: FormData): Promise<FormState> {
  const { orgId } = await requireOrg();
  const id = String(formData.get("id") ?? "");
  const r = await db.query.receipts.findFirst({ where: and(eq(receipts.id, id), eq(receipts.orgId, orgId)) });
  if (!r?.fileId) return { ok: false, message: "No photo to read." };
  const file = await db.query.files.findFirst({ where: and(eq(files.id, r.fileId), eq(files.orgId, orgId)) });
  if (!file) return { ok: false, message: "The photo is missing." };
  try {
    const x = await extractReceipt({ data: file.data, mimeType: file.mimeType, filename: file.filename });
    if (!x.is_receipt) return { ok: false, message: "That photo doesn't look like a receipt." };
    const draft = normalizeExtraction(x);
    await db.transaction(async (tx) => {
      await tx
        .update(receipts)
        .set({
          status: "needs_review",
          vendor: draft.vendor,
          vendorBranch: draft.vendorBranch,
          vendorAbn: draft.vendorAbn,
          vendorAddress: draft.vendorAddress,
          vendorPhone: draft.vendorPhone,
          receiptNumber: draft.receiptNumber,
          date: draft.date ?? r.date,
          time: draft.time,
          paymentMethod: draft.paymentMethod,
          cardLast4: draft.cardLast4,
          subtotal: fromCents(draft.subtotalCents),
          gstAmount: fromCents(draft.gstCents),
          total: fromCents(draft.totalCents),
          isTaxInvoice: draft.isTaxInvoice,
          category: draft.category,
          notes: draft.notes ?? r.notes,
          rawOcrData: JSON.stringify(x),
          scanConfidence: draft.confidence,
          scanWarnings: draft.warnings,
          updatedAt: new Date(),
        })
        .where(eq(receipts.id, id));
      await writeItems(tx, orgId, id, draft.items, draft.gstCents);
    });
  } catch (err) {
    return { ok: false, message: err instanceof ScanError ? err.message : "Couldn't read it. Try again." };
  }
  revalidatePath(`/receipts/${id}`);
  redirect(`/receipts/${id}`);
}
