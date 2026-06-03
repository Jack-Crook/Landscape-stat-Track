"use server";

import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { quotes, jobs } from "@/db/schema";
import { requireOrg } from "@/lib/auth";
import { DEFAULT_TAX_RATE } from "@/lib/constants";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

export type QuoteLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

const lineItemSchema = z.object({
  description: z.string().trim().min(1),
  quantity: z.number().nonnegative(),
  unitPrice: z.number().nonnegative(),
});

const createQuoteSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  clientId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  validUntil: z.preprocess(emptyToUndefined, z.string().optional()),
  notes: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  // Serialized JSON array from the client form.
  lineItems: z
    .string()
    .transform((raw, ctx) => {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid line items" });
        return z.NEVER;
      }
    })
    .pipe(z.array(lineItemSchema).min(1, "Add at least one line item")),
});

const quoteStatuses = ["draft", "sent", "accepted", "declined", "no_response"] as const;

export type CreateQuoteState = {
  errors?: Record<string, string[]>;
  message?: string;
};

/** Lists every quote for the current org, newest first, with client name joined. */
export async function listQuotes() {
  const { orgId } = await requireOrg();
  return db.query.quotes.findMany({
    where: eq(quotes.orgId, orgId),
    orderBy: desc(quotes.createdAt),
    with: { client: { columns: { id: true, name: true } } },
  });
}

function totalsFor(items: QuoteLineItem[]) {
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const gstAmount = subtotal * DEFAULT_TAX_RATE;
  return {
    subtotal: subtotal.toFixed(2),
    gstAmount: gstAmount.toFixed(2),
    total: (subtotal + gstAmount).toFixed(2),
  };
}

/**
 * Creates a quote. Totals (subtotal/GST/total) are computed server-side from the
 * line items — the client-sent totals are never trusted. Returns `{ errors }` for
 * `useActionState`; on success revalidates and redirects to the list.
 */
export async function createQuote(
  _prevState: CreateQuoteState,
  formData: FormData
): Promise<CreateQuoteState> {
  const { orgId } = await requireOrg();

  const parsed = createQuoteSchema.safeParse({
    title: formData.get("title"),
    clientId: formData.get("clientId"),
    validUntil: formData.get("validUntil"),
    notes: formData.get("notes"),
    lineItems: formData.get("lineItems"),
  });

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const data = parsed.data;
  const totals = totalsFor(data.lineItems);

  await db.insert(quotes).values({
    orgId,
    clientId: data.clientId ?? null,
    title: data.title,
    lineItems: JSON.stringify(data.lineItems),
    subtotal: totals.subtotal,
    gstAmount: totals.gstAmount,
    total: totals.total,
    notes: data.notes ?? null,
    validUntil: data.validUntil ? new Date(data.validUntil) : null,
  });

  revalidatePath("/quotes");
  redirect("/quotes");
}

/**
 * Advances a quote's status. Stamps `sentAt` when moving to "sent" and
 * `respondedAt` when the client accepts/declines/doesn't respond.
 */
export async function updateQuoteStatus(quoteId: string, status: string) {
  const { orgId } = await requireOrg();

  const parsed = z.object({
    quoteId: z.string().uuid(),
    status: z.enum(quoteStatuses),
  }).safeParse({ quoteId, status });
  if (!parsed.success) return { error: "Invalid quote or status" };

  const now = new Date();
  const patch: Record<string, unknown> = { status: parsed.data.status, updatedAt: now };
  if (parsed.data.status === "sent") patch.sentAt = now;
  if (["accepted", "declined", "no_response"].includes(parsed.data.status)) {
    patch.respondedAt = now;
  }

  await db
    .update(quotes)
    .set(patch)
    .where(and(eq(quotes.id, parsed.data.quoteId), eq(quotes.orgId, orgId)));

  revalidatePath("/quotes");
  return { ok: true };
}

/**
 * Converts an accepted quote into a job: creates a job seeded from the quote
 * (title, client, total → quoted price) and links the quote to it. Idempotent —
 * bails if the quote already has a job. Uses `db.batch` for atomicity since the
 * neon-http driver has no interactive transactions.
 */
export async function convertQuoteToJob(quoteId: string) {
  const { orgId } = await requireOrg();

  const quote = await db.query.quotes.findFirst({
    where: and(eq(quotes.id, quoteId), eq(quotes.orgId, orgId)),
  });
  if (!quote) return { error: "Quote not found" };
  if (quote.jobId) redirect(`/jobs/${quote.jobId}`);

  const jobId = crypto.randomUUID();
  await db.batch([
    db.insert(jobs).values({
      id: jobId,
      orgId,
      clientId: quote.clientId,
      name: quote.title,
      quotedPrice: quote.total,
      status: "quoted",
    }),
    db
      .update(quotes)
      .set({ jobId, status: "accepted", respondedAt: new Date(), updatedAt: new Date() })
      .where(eq(quotes.id, quoteId)),
  ]);

  revalidatePath("/quotes");
  revalidatePath("/jobs");
  redirect(`/jobs/${jobId}`);
}
