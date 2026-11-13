import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { db } from "@/db";
import { quotes } from "@/db/schema";
import { getOrg } from "@/lib/auth";
import { clientOptions, jobCategoryOptions } from "@/lib/data/lookups";
import { categoryMargins } from "@/lib/data/insights";
import { parseStoredLines } from "@/lib/line-items";
import { toCents } from "@/lib/money";
import { toDateInput } from "@/lib/periods";
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_TONES } from "@/lib/constants";
import { formatCents, formatDate, formatQuantity } from "@/lib/format";
import { KeyValue, LinkButton, Notice, Page, PageHeader, Pill, Section } from "@/components/kit/ui";
import { ConfirmSubmit, SubmitButton } from "@/components/kit/client";
import { QuoteForm } from "../quote-form";
import { convertQuoteToJob, deleteQuote, duplicateQuote, updateQuoteStatus } from "../actions";

export default async function QuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const org = await getOrg();
  const { id } = await params;
  const { edit } = await searchParams;
  const quote = await db.query.quotes.findFirst({
    where: and(eq(quotes.id, id), eq(quotes.orgId, org.id)),
    with: { client: true, job: { columns: { id: true, name: true } } },
  });
  if (!quote) notFound();
  const lines = parseStoredLines(quote.lineItems);

  if (edit) {
    const [clients, categories, margins] = await Promise.all([
      clientOptions(org.id),
      jobCategoryOptions(org.id),
      categoryMargins(org.id, org.gstRegistered),
    ]);
    return (
      <Page>
        <PageHeader title="Edit quote" back={{ href: `/quotes/${id}`, label: quote.number ?? "Quote" }} />
        <QuoteForm
          quote={{ ...quote, validUntil: toDateInput(quote.validUntil), lineItems: lines }}
          clients={clients}
          categories={categories}
          gstRegistered={org.gstRegistered}
          categoryMargins={margins}
        />
        <form action={deleteQuote} className="mt-8 flex justify-center">
          <input type="hidden" name="id" value={quote.id} />
          <ConfirmSubmit confirmText="Tap again to delete quote">Delete quote</ConfirmSubmit>
        </form>
      </Page>
    );
  }

  const expired = quote.validUntil && quote.validUntil < new Date() && ["draft", "sent"].includes(quote.status);
  const margin =
    quote.estimatedCost && toCents(quote.subtotal) > 0
      ? ((toCents(quote.subtotal) - toCents(quote.estimatedCost)) / toCents(quote.subtotal)) * 100
      : null;

  const statusButton = (status: string, label: string, variant: "filled" | "tinted" | "gray" = "gray") => (
    <form action={updateQuoteStatus}>
      <input type="hidden" name="quoteId" value={quote.id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton variant={variant} size="sm">
        {label}
      </SubmitButton>
    </form>
  );

  return (
    <Page>
      <PageHeader
        title={quote.title}
        back={{ href: "/quotes", label: "Quotes" }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Pill tone={QUOTE_STATUS_TONES[quote.status]}>{QUOTE_STATUS_LABELS[quote.status]}</Pill>
            {quote.number}
            {quote.client && (
              <Link href={`/clients/${quote.client.id}`} className="font-medium text-tint-ink">
                {quote.client.name}
              </Link>
            )}
          </span>
        }
        actions={
          <>
            <LinkButton href={`/api/pdf/quote/${quote.id}`} variant="gray" target="_blank">
              <Download className="h-4 w-4" /> PDF
            </LinkButton>
            <LinkButton href={`/quotes/${id}?edit=1`} variant="gray">
              Edit
            </LinkButton>
          </>
        }
      />

      {expired && <Notice tone="warn" title="This quote has expired">Valid until {formatDate(quote.validUntil)}. Edit it to extend, or mark it as no response.</Notice>}

      {quote.job ? (
        <Notice tone="good" title="Converted to a job" action={<LinkButton href={`/jobs/${quote.job.id}`} size="sm" variant="tinted">Open job</LinkButton>}>
          {quote.job.name}
        </Notice>
      ) : (
        <Section title="What happened?">
          <div className="flex flex-wrap gap-2">
            {quote.status === "draft" && statusButton("sent", "Mark as sent", "tinted")}
            <form action={convertQuoteToJob}>
              <input type="hidden" name="quoteId" value={quote.id} />
              <SubmitButton size="sm" pendingText="Creating job…">
                Accepted: create job
              </SubmitButton>
            </form>
            {quote.status !== "declined" && statusButton("declined", "Declined")}
            {quote.status !== "no_response" && statusButton("no_response", "No response")}
            {quote.status !== "draft" && statusButton("draft", "Back to draft")}
          </div>
          <p className="footnote mt-3 text-label-2">
            {quote.sentAt ? `Sent ${formatDate(quote.sentAt)}. ` : ""}
            Recording the outcome keeps your win rate accurate.
          </p>
        </Section>
      )}

      <Section title="Lines">
        <table className="w-full text-[15px]">
          <thead className="footnote text-left text-label-2">
            <tr>
              <th className="pb-2 font-medium">Description</th>
              <th className="pb-2 text-right font-medium">Qty</th>
              <th className="pb-2 text-right font-medium">Unit</th>
              <th className="pb-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-separator">
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="py-2 pr-2">{l.description}</td>
                <td className="num py-2 text-right">{formatQuantity(l.quantity)}</td>
                <td className="num py-2 text-right">{formatCents(Math.round(l.unitPrice * 100))}</td>
                <td className="num py-2 text-right">{formatCents(Math.round(l.quantity * l.unitPrice * 100))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="ml-auto mt-4 max-w-xs space-y-1 border-t border-separator pt-3">
          <div className="flex justify-between text-label-2">
            <dt>Subtotal</dt>
            <dd className="num">{formatCents(toCents(quote.subtotal))}</dd>
          </div>
          {toCents(quote.gstAmount) > 0 && (
            <div className="flex justify-between text-label-2">
              <dt>GST</dt>
              <dd className="num">{formatCents(toCents(quote.gstAmount))}</dd>
            </div>
          )}
          <div className="headline flex justify-between">
            <dt>Total</dt>
            <dd className="num">{formatCents(toCents(quote.total))}</dd>
          </div>
        </dl>
      </Section>

      <Section title="Details">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KeyValue label="Created" value={formatDate(quote.createdAt)} />
          <KeyValue label="Valid until" value={formatDate(quote.validUntil)} />
          <KeyValue label="Expected costs" value={quote.estimatedCost ? formatCents(toCents(quote.estimatedCost)) : "—"} />
          <KeyValue label="Expected margin" value={margin == null ? "—" : `${margin.toFixed(0)}%`} tone={margin != null && margin < 15 ? "bad" : undefined} />
        </dl>
        {quote.notes && <p className="mt-4 whitespace-pre-wrap text-label-2">{quote.notes}</p>}
      </Section>

      <form action={duplicateQuote} className="flex justify-center">
        <input type="hidden" name="quoteId" value={quote.id} />
        <SubmitButton variant="plain">Duplicate as a new quote</SubmitButton>
      </form>
    </Page>
  );
}
