"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { jobs, quotes } from "@/db/schema";
import { getOrg, requireOrg } from "@/lib/auth";
import { formObject, invalid, optionalDate, optionalMoney, optionalText, optionalUuid, requiredText, type FormState } from "@/lib/actions";
import { QUOTE_STATUSES } from "@/lib/constants";
import { lineItemsField } from "@/lib/line-items";
import { ownsClient } from "@/lib/data/ownership";
import { lineItemTotals } from "@/lib/gst";
import { fromCents } from "@/lib/money";
import { nextQuoteNumber } from "@/lib/data/invoices";
import { recomputeJobTotals } from "@/lib/data/jobs";

const quoteSchema = z.object({
  title: requiredText("Give the quote a title"),
  clientId: optionalUuid,
  category: optionalText,
  validUntil: optionalDate,
  notes: optionalText,
  estimatedCost: optionalMoney,
  lineItems: lineItemsField,
});

export async function saveQuote(_prev: FormState, formData: FormData): Promise<FormState> {
  const org = await getOrg();
  const parsed = quoteSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  if (!(await ownsClient(org.id, d.clientId))) return { ok: false, message: "Client not found", errors: { clientId: ["Pick a client from the list"] } };
  // Totals are always recomputed here; client-side totals are display only.
  const totals = lineItemTotals(d.lineItems, org.gstRegistered);
  const values = {
    title: d.title,
    clientId: d.clientId ?? null,
    category: d.category ?? null,
    validUntil: d.validUntil ?? null,
    notes: d.notes ?? null,
    estimatedCost: d.estimatedCost == null ? null : fromCents(d.estimatedCost),
    lineItems: JSON.stringify(d.lineItems),
    subtotal: fromCents(totals.subtotal),
    gstAmount: fromCents(totals.gst),
    total: fromCents(totals.total),
    updatedAt: new Date(),
  };

  const id = formData.get("id");
  let quoteId: string;
  if (typeof id === "string" && id) {
    const [row] = await db.update(quotes).set(values).where(and(eq(quotes.id, id), eq(quotes.orgId, org.id))).returning({ id: quotes.id });
    if (!row) return { ok: false, message: "Quote not found" };
    quoteId = row.id;
  } else {
    quoteId = await db.transaction(async (tx) => {
      const number = await nextQuoteNumber(tx, org.id);
      const [row] = await tx.insert(quotes).values({ ...values, orgId: org.id, number }).returning({ id: quotes.id });
      return row.id;
    });
  }
  revalidatePath("/quotes");
  redirect(`/quotes/${quoteId}`);
}

export async function updateQuoteStatus(formData: FormData) {
  const { orgId } = await requireOrg();
  const parsed = z
    .object({ quoteId: z.string().uuid(), status: z.enum(QUOTE_STATUSES) })
    .safeParse({ quoteId: formData.get("quoteId"), status: formData.get("status") });
  if (!parsed.success) return;
  const now = new Date();
  const patch: Partial<typeof quotes.$inferInsert> = { status: parsed.data.status, updatedAt: now };
  if (parsed.data.status === "sent") patch.sentAt = now;
  if (["accepted", "declined", "no_response"].includes(parsed.data.status)) patch.respondedAt = now;
  if (parsed.data.status === "draft") {
    patch.sentAt = null;
    patch.respondedAt = null;
  }
  await db.update(quotes).set(patch).where(and(eq(quotes.id, parsed.data.quoteId), eq(quotes.orgId, orgId)));
  revalidatePath("/quotes");
  revalidatePath(`/quotes/${parsed.data.quoteId}`);
}

/**
 * Turns a quote into a job (price = quote total incl. GST, expected costs carried
 * over) and marks the quote accepted. Idempotent: an already-converted quote
 * just opens its job.
 */
export async function convertQuoteToJob(formData: FormData) {
  const { orgId } = await requireOrg();
  const quoteId = String(formData.get("quoteId") ?? "");
  const quote = await db.query.quotes.findFirst({ where: and(eq(quotes.id, quoteId), eq(quotes.orgId, orgId)) });
  if (!quote) return;
  if (quote.jobId) redirect(`/jobs/${quote.jobId}`);

  const jobId = await db.transaction(async (tx) => {
    const [job] = await tx
      .insert(jobs)
      .values({
        orgId,
        clientId: quote.clientId,
        name: quote.title,
        category: quote.category,
        description: quote.notes,
        quotedPrice: quote.total,
        estimatedCost: quote.estimatedCost,
        status: "quoted",
      })
      .returning({ id: jobs.id });
    const now = new Date();
    await tx
      .update(quotes)
      .set({ jobId: job.id, status: "accepted", respondedAt: quote.respondedAt ?? now, sentAt: quote.sentAt ?? now, updatedAt: now })
      .where(eq(quotes.id, quoteId));
    return job.id;
  });
  await recomputeJobTotals(jobId);
  revalidatePath("/quotes");
  revalidatePath("/jobs");
  redirect(`/jobs/${jobId}`);
}

export async function duplicateQuote(formData: FormData) {
  const org = await getOrg();
  const quoteId = String(formData.get("quoteId") ?? "");
  const q = await db.query.quotes.findFirst({ where: and(eq(quotes.id, quoteId), eq(quotes.orgId, org.id)) });
  if (!q) return;
  const newId = await db.transaction(async (tx) => {
    const number = await nextQuoteNumber(tx, org.id);
    const [row] = await tx
      .insert(quotes)
      .values({
        orgId: org.id,
        number,
        clientId: q.clientId,
        title: `${q.title} (copy)`,
        category: q.category,
        estimatedCost: q.estimatedCost,
        lineItems: q.lineItems,
        subtotal: q.subtotal,
        gstAmount: q.gstAmount,
        total: q.total,
        notes: q.notes,
      })
      .returning({ id: quotes.id });
    return row.id;
  });
  revalidatePath("/quotes");
  redirect(`/quotes/${newId}?edit=1`);
}

export async function deleteQuote(formData: FormData) {
  const { orgId } = await requireOrg();
  await db.delete(quotes).where(and(eq(quotes.id, String(formData.get("id") ?? "")), eq(quotes.orgId, orgId)));
  revalidatePath("/quotes");
  redirect("/quotes");
}
