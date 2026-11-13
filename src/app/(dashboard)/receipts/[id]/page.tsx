import { and, asc, count, eq, ne } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { db } from "@/db";
import { receiptItems, receipts } from "@/db/schema";
import { getOrg } from "@/lib/auth";
import { scannerMode } from "@/lib/env";
import { allJobOptions } from "@/lib/data/lookups";
import { findDuplicate } from "@/lib/data/receipts";
import { toDateInput } from "@/lib/periods";
import { formatAbn, isValidAbn } from "@/lib/gst";
import { Notice, Page, PageHeader, Pill } from "@/components/kit/ui";
import { ConfirmSubmit } from "@/components/kit/client";
import { ReceiptEditor } from "../receipt-editor";
import { deleteReceipt } from "../actions";
import { RescanButton } from "./rescan";

export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const org = await getOrg();
  const { id } = await params;
  const { saved } = await searchParams;
  const receipt = await db.query.receipts.findFirst({
    where: and(eq(receipts.id, id), eq(receipts.orgId, org.id)),
    with: { items: { orderBy: asc(receiptItems.position) }, file: { columns: { id: true, mimeType: true } } },
  });
  if (!receipt) notFound();

  const [jobs, [{ value: othersToReview }], dup] = await Promise.all([
    allJobOptions(org.id),
    db
      .select({ value: count() })
      .from(receipts)
      .where(and(eq(receipts.orgId, org.id), eq(receipts.status, "needs_review"), ne(receipts.id, id))),
    findDuplicate(org.id, receipt),
  ]);

  const warnings = receipt.scanWarnings ?? [];
  const isPdf = receipt.file?.mimeType === "application/pdf";
  const fileUrl = receipt.file ? `/api/files/${receipt.file.id}` : null;

  return (
    <Page wide>
      <PageHeader
        title={receipt.status === "needs_review" ? "Review receipt" : receipt.vendor}
        back={{ href: "/receipts", label: "Receipts" }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {receipt.status === "needs_review" ? <Pill tone="orange">Needs review</Pill> : <Pill tone="green">Confirmed</Pill>}
            {receipt.scanConfidence && <span>Scan confidence: {receipt.scanConfidence}</span>}
            {receipt.vendorAbn && (
              <span className={isValidAbn(receipt.vendorAbn) ? "" : "text-bad"}>ABN {formatAbn(receipt.vendorAbn)}</span>
            )}
          </span>
        }
        actions={fileUrl && scannerMode() !== "off" ? <RescanButton id={receipt.id} /> : undefined}
      />

      {saved && <Notice tone="good" title="Saved. Here's the next one to review." />}
      {dup && (
        <Notice tone="warn" title="Possible duplicate" action={<a className="footnote font-semibold text-tint-ink" href={`/receipts/${dup.id}`}>Compare</a>}>
          {dup.vendor} has a receipt with the same total within a day of this one.
        </Notice>
      )}
      {warnings.length > 0 && (
        <Notice tone="warn" title="Check before confirming">
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="lg:sticky lg:top-6 lg:self-start">
          {fileUrl ? (
            <div className="overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-card)]">
              {isPdf ? (
                <iframe src={fileUrl} title="Receipt PDF" className="h-[70vh] w-full" />
              ) : (
                <a href={fileUrl} target="_blank" rel="noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fileUrl} alt={`Receipt from ${receipt.vendor}`} className="max-h-[75vh] w-full object-contain" />
                </a>
              )}
              <a href={fileUrl} target="_blank" rel="noreferrer" className="footnote flex items-center justify-center gap-1 border-t border-separator py-2.5 font-medium text-tint-ink">
                Open full size <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          ) : (
            <div className="rounded-2xl bg-surface p-6 text-center text-label-2 shadow-[var(--shadow-card)]">No photo. Entered by hand.</div>
          )}
        </div>

        <div>
          <ReceiptEditor
            receipt={{
              id: receipt.id,
              vendor: receipt.vendor,
              vendorBranch: receipt.vendorBranch,
              vendorAbn: receipt.vendorAbn,
              receiptNumber: receipt.receiptNumber,
              date: toDateInput(receipt.date),
              time: receipt.time,
              paymentMethod: receipt.paymentMethod,
              cardLast4: receipt.cardLast4,
              total: Number(receipt.total).toFixed(2),
              gstAmount: receipt.gstAmount,
              category: receipt.category ?? "other",
              jobId: receipt.jobId,
              isCapital: receipt.isCapital,
              notes: receipt.notes,
              items: receipt.items.map((i) => ({
                description: i.description,
                itemName: i.itemName,
                category: i.category,
                quantity: String(Number(i.quantity)),
                unitPrice: i.unitPrice == null ? "" : Number(i.unitPrice).toFixed(2),
                total: Number(i.total).toFixed(2),
                gstFree: i.gstFree,
                brand: i.brand,
                sku: i.sku,
                unit: i.unit,
              })),
            }}
            jobs={jobs}
            gstRegistered={org.gstRegistered}
            hasMoreToReview={receipt.status === "needs_review" && othersToReview > 0}
            confirmed={receipt.status === "confirmed"}
          />
          <form action={deleteReceipt} className="mt-8 flex justify-center">
            <input type="hidden" name="id" value={receipt.id} />
            <ConfirmSubmit confirmText="Tap again to delete receipt">Delete receipt</ConfirmSubmit>
          </form>
        </div>
      </div>
    </Page>
  );
}
