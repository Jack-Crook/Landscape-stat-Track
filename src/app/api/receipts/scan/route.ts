import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { files, jobs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { extractReceipt, ScanError, SUPPORTED_SCAN_TYPES } from "@/lib/receipts/extract";
import { normalizeExtraction } from "@/lib/receipts/normalize";
import { findDuplicate, insertDraftReceipt } from "@/lib/data/receipts";
import { fromCents } from "@/lib/money";

// Claude reads a receipt in ~5–20s; leave room for slow PDFs.
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

/**
 * POST multipart/form-data { file, jobId? }
 * Stores the file, reads it with Claude, and saves a receipt in "needs review"
 * with every line item. If reading fails the receipt is still created (with the
 * image) so it can be typed in by hand next to the photo.
 */
export async function POST(req: Request) {
  const current = await getCurrentUser();
  if (!current) return json({ error: "Sign in again to scan receipts." }, 401);
  const { orgId } = current;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Upload failed — the file may be too large." }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "No file uploaded." }, 400);
  if (!(SUPPORTED_SCAN_TYPES as readonly string[]).includes(file.type)) {
    return json({ error: "Use a photo (JPEG, PNG, WebP) or a PDF." }, 415);
  }
  if (file.size > MAX_BYTES) return json({ error: "That file is over 8 MB. Try a smaller photo or PDF." }, 413);

  let jobId: string | null = null;
  const rawJob = form.get("jobId");
  if (typeof rawJob === "string" && rawJob) {
    const job = await db.query.jobs.findFirst({ where: and(eq(jobs.id, rawJob), eq(jobs.orgId, orgId)), columns: { id: true } });
    jobId = job?.id ?? null;
  }

  const data = Buffer.from(await file.arrayBuffer());
  const [stored] = await db
    .insert(files)
    .values({ orgId, filename: file.name || "receipt", mimeType: file.type, size: data.length, data })
    .returning({ id: files.id });

  try {
    const extraction = await extractReceipt({ data, mimeType: file.type, filename: file.name });
    if (!extraction.is_receipt) {
      await db.delete(files).where(eq(files.id, stored.id));
      return json({ error: "That doesn't look like a receipt or invoice. Try another photo.", notReceipt: true }, 422);
    }
    const draft = normalizeExtraction(extraction);
    const dup = await findDuplicate(orgId, { date: draft.date ?? new Date(), total: fromCents(draft.totalCents), vendor: draft.vendor });
    if (dup) draft.warnings.unshift(`Looks like a receipt you already have (${dup.vendor}, same total and date).`);
    const id = await insertDraftReceipt(orgId, draft, { fileId: stored.id, jobId, raw: extraction });
    revalidatePath("/receipts");
    return json({
      id,
      vendor: draft.vendor,
      total: draft.totalCents,
      items: draft.items.length,
      warnings: draft.warnings,
      duplicateOf: dup?.id ?? null,
    });
  } catch (err) {
    const message = err instanceof ScanError ? err.message : "Something went wrong reading that receipt.";
    if (!(err instanceof ScanError)) console.error("Receipt scan failed", err);
    if (err instanceof ScanError && err.retryable) {
      await db.delete(files).where(eq(files.id, stored.id));
      return json({ error: message, retryable: true }, 503);
    }
    // Keep the photo: save an empty draft so it can be entered by hand.
    const id = await insertDraftReceipt(
      orgId,
      {
        vendor: "Unknown supplier",
        vendorBranch: null,
        vendorAbn: null,
        vendorAddress: null,
        vendorPhone: null,
        receiptNumber: null,
        date: new Date(),
        time: null,
        paymentMethod: null,
        cardLast4: null,
        subtotalCents: 0,
        discountCents: null,
        gstCents: 0,
        totalCents: 0,
        isTaxInvoice: false,
        category: "other",
        notes: null,
        confidence: "low",
        items: [],
        warnings: [`Couldn't read it automatically: ${message} Fill it in from the photo.`],
      },
      { fileId: stored.id, jobId, raw: { error: message } }
    );
    revalidatePath("/receipts");
    return json({ id, manual: true, warnings: [message] });
  }
}
