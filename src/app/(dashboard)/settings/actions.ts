"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { jobCategories, organisations } from "@/db/schema";
import { getOrg, requireOrg } from "@/lib/auth";
import { checkbox, formObject, invalid, optionalMoney, optionalText, requiredText, type FormState } from "@/lib/actions";
import { isValidAbn } from "@/lib/gst";
import { fromCents } from "@/lib/money";
import { recomputeAllJobs } from "@/lib/data/jobs";

const settingsSchema = z.object({
  name: requiredText("Business name is required"),
  ownerName: optionalText,
  abn: z
    .preprocess((v) => (typeof v === "string" ? v.replace(/\s/g, "") || undefined : v), z.string().optional())
    .refine((v) => v === undefined || isValidAbn(v), "That ABN doesn't pass the ATO check"),
  email: z.preprocess((v) => (v === "" ? undefined : v), z.string().email("Enter a valid email").optional()),
  phone: optionalText,
  address: optionalText,
  gstRegistered: checkbox,
  entityType: z.enum(["sole_trader", "company"]),
  basFrequency: z.enum(["quarterly", "monthly"]),
  accountingBasis: z.enum(["cash", "accrual"]),
  otherIncome: optionalMoney,
  mileageRate: z.coerce.number({ error: "Enter a rate" }).min(0).max(5),
  defaultHourlyRate: optionalMoney,
  invoicePrefix: z.string().trim().max(10).default("INV-"),
  nextInvoiceNumber: z.coerce.number().int().min(1).max(999999),
  quotePrefix: z.string().trim().max(10).default("Q-"),
  paymentTermsDays: z.coerce.number().int().min(0).max(120),
  bankAccountName: optionalText,
  bankBsb: z.preprocess((v) => (typeof v === "string" ? v.replace(/\D/g, "") || undefined : v), z.string().length(6, "A BSB is 6 digits").optional()),
  bankAccountNumber: z.preprocess((v) => (typeof v === "string" ? v.replace(/\s/g, "") || undefined : v), z.string().regex(/^\d{4,10}$/, "4–10 digits").optional()),
  invoiceNotes: optionalText,
});

export async function saveSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await getOrg();
  const parsed = settingsSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  await db
    .update(organisations)
    .set({
      name: d.name,
      ownerName: d.ownerName ?? null,
      abn: d.abn ?? null,
      email: d.email ?? null,
      phone: d.phone ?? null,
      address: d.address ?? null,
      gstRegistered: d.gstRegistered,
      entityType: d.entityType,
      basFrequency: d.basFrequency,
      accountingBasis: d.accountingBasis,
      otherIncome: fromCents(d.otherIncome ?? 0),
      mileageRate: d.mileageRate.toFixed(4),
      defaultHourlyRate: d.defaultHourlyRate == null ? null : fromCents(d.defaultHourlyRate),
      invoicePrefix: d.invoicePrefix,
      nextInvoiceNumber: d.nextInvoiceNumber,
      quotePrefix: d.quotePrefix,
      paymentTermsDays: d.paymentTermsDays,
      bankAccountName: d.bankAccountName ?? null,
      bankBsb: d.bankBsb ? `${d.bankBsb.slice(0, 3)}-${d.bankBsb.slice(3)}` : null,
      bankAccountNumber: d.bankAccountNumber ?? null,
      invoiceNotes: d.invoiceNotes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(organisations.id, org.id));
  // Job profit is ex-GST when registered, so a change re-prices every job.
  if (d.gstRegistered !== org.gstRegistered) await recomputeAllJobs(org.id);
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved" };
}

export async function addCategory(formData: FormData) {
  const { orgId } = await requireOrg();
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  if (!name) return;
  const existing = await db.query.jobCategories.findFirst({ where: and(eq(jobCategories.orgId, orgId), eq(jobCategories.name, name)) });
  if (!existing) await db.insert(jobCategories).values({ orgId, name });
  revalidatePath("/settings");
}

export async function deleteCategory(formData: FormData) {
  const { orgId } = await requireOrg();
  await db.delete(jobCategories).where(and(eq(jobCategories.id, String(formData.get("id") ?? "")), eq(jobCategories.orgId, orgId)));
  revalidatePath("/settings");
}
