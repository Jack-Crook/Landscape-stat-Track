import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Mail } from "lucide-react";
import { db } from "@/db";
import { invoices } from "@/db/schema";
import { getOrg } from "@/lib/auth";
import { allJobOptions, clientOptions } from "@/lib/data/lookups";
import { toCents } from "@/lib/money";
import { daysBetween, toDateInput } from "@/lib/periods";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_TONES } from "@/lib/constants";
import { formatCents, formatDate, formatQuantity } from "@/lib/format";
import { KeyValue, LinkButton, Notice, Page, PageHeader, Pill, Section } from "@/components/kit/ui";
import { ConfirmSubmit, SubmitButton } from "@/components/kit/client";
import { InvoiceForm } from "../invoice-form";
import { markInvoiceSent, markUnpaid, voidInvoice } from "../actions";
import { PaymentForm } from "./payment-form";

export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const org = await getOrg();
  const { id } = await params;
  const { edit } = await searchParams;
  const inv = await db.query.invoices.findFirst({
    where: and(eq(invoices.id, id), eq(invoices.orgId, org.id)),
    with: { client: true, job: { columns: { id: true, name: true } } },
  });
  if (!inv) notFound();

  if (edit && (inv.status === "draft" || inv.status === "sent")) {
    const [clients, jobOpts] = await Promise.all([clientOptions(org.id), allJobOptions(org.id)]);
    return (
      <Page>
        <PageHeader title={`Edit ${inv.number}`} back={{ href: `/invoices/${id}`, label: inv.number }} />
        <InvoiceForm
          invoice={{ ...inv, issueDate: toDateInput(inv.issueDate), dueDate: toDateInput(inv.dueDate) }}
          clients={clients}
          jobs={jobOpts}
          gstRegistered={org.gstRegistered}
        />
      </Page>
    );
  }

  const now = new Date();
  const overdueDays = inv.status === "sent" && inv.dueDate && inv.dueDate < now ? daysBetween(inv.dueDate, now) : 0;
  const emailBody = encodeURIComponent(
    `Hi${inv.client?.name ? ` ${inv.client.name.split(" ")[0]}` : ""},\n\nPlease find invoice ${inv.number} for ${formatCents(toCents(inv.total))}${inv.dueDate ? `, due ${formatDate(inv.dueDate)}` : ""}.\n\n${org.bankBsb && org.bankAccountNumber ? `Bank transfer: ${org.bankAccountName ?? org.name}, BSB ${org.bankBsb}, Acc ${org.bankAccountNumber}, ref ${inv.number}\n\n` : ""}Thanks,\n${org.ownerName ?? org.name}`
  );

  return (
    <Page>
      <PageHeader
        title={inv.number}
        back={{ href: "/invoices", label: "Invoices" }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {overdueDays > 0 ? <Pill tone="red">Overdue {overdueDays} days</Pill> : <Pill tone={INVOICE_STATUS_TONES[inv.status]}>{INVOICE_STATUS_LABELS[inv.status]}</Pill>}
            {inv.client && (
              <Link href={`/clients/${inv.client.id}`} className="font-medium text-tint-ink">
                {inv.client.name}
              </Link>
            )}
            {inv.job && (
              <Link href={`/jobs/${inv.job.id}`} className="font-medium text-tint-ink">
                {inv.job.name}
              </Link>
            )}
          </span>
        }
        actions={
          <>
            <LinkButton href={`/api/pdf/invoice/${inv.id}`} variant="gray" target="_blank">
              <Download className="h-4 w-4" /> PDF
            </LinkButton>
            {inv.client?.email && inv.status !== "void" && (
              <LinkButton href={`mailto:${inv.client.email}?subject=${encodeURIComponent(`Invoice ${inv.number} from ${org.name}`)}&body=${emailBody}`} variant="gray">
                <Mail className="h-4 w-4" /> Email
              </LinkButton>
            )}
            {(inv.status === "draft" || inv.status === "sent") && (
              <LinkButton href={`/invoices/${id}?edit=1`} variant="gray">
                Edit
              </LinkButton>
            )}
          </>
        }
      />

      {inv.status === "draft" && (
        <Notice
          tone="info"
          title="Draft"
          action={
            <form action={markInvoiceSent}>
              <input type="hidden" name="id" value={inv.id} />
              <SubmitButton size="sm">Mark as sent</SubmitButton>
            </form>
          }
        >
          Drafts don&apos;t count as income or GST until they&apos;re sent.
        </Notice>
      )}

      {inv.status === "sent" && (
        <Section title="Payment">
          <PaymentForm id={inv.id} today={toDateInput(now)} />
          <p className="footnote mt-3 text-label-2">
            {org.accountingBasis === "cash" ? "You report GST on a cash basis, so this counts as income on the date it's paid." : "You report on an accrual basis, so this already counts as income from its issue date."}
          </p>
        </Section>
      )}

      {inv.status === "paid" && (
        <Notice
          tone="good"
          title={`Paid ${formatDate(inv.paidAt)}`}
          action={
            <form action={markUnpaid}>
              <input type="hidden" name="id" value={inv.id} />
              <SubmitButton variant="plain" size="sm">
                Mark unpaid
              </SubmitButton>
            </form>
          }
        >
          {inv.paidAt && `${daysBetween(inv.issueDate, inv.paidAt)} days after it was issued.`}
        </Notice>
      )}

      {inv.status === "void" && <Notice tone="bad" title="Void">This invoice is cancelled and excluded from income and GST.</Notice>}

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
            {inv.lineItems.map((l, i) => (
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
            <dd className="num">{formatCents(toCents(inv.subtotal))}</dd>
          </div>
          {toCents(inv.gstAmount) > 0 && (
            <div className="flex justify-between text-label-2">
              <dt>GST</dt>
              <dd className="num">{formatCents(toCents(inv.gstAmount))}</dd>
            </div>
          )}
          <div className="headline flex justify-between">
            <dt>Total</dt>
            <dd className="num" data-testid="invoice-total">
              {formatCents(toCents(inv.total))}
            </dd>
          </div>
        </dl>
      </Section>

      <Section title="Details">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KeyValue label="Issued" value={formatDate(inv.issueDate)} />
          <KeyValue label="Due" value={formatDate(inv.dueDate)} tone={overdueDays > 0 ? "bad" : undefined} />
          <KeyValue label="Sent" value={formatDate(inv.sentAt)} />
          <KeyValue label="Paid" value={formatDate(inv.paidAt)} />
        </dl>
        {inv.notes && <p className="mt-4 whitespace-pre-wrap text-label-2">{inv.notes}</p>}
      </Section>

      {inv.status !== "void" && inv.status !== "paid" && (
        <form action={voidInvoice} className="flex justify-center">
          <input type="hidden" name="id" value={inv.id} />
          <ConfirmSubmit confirmText={inv.status === "draft" ? "Tap again to delete" : "Tap again to void"}>
            {inv.status === "draft" ? "Delete draft" : "Void invoice"}
          </ConfirmSubmit>
        </form>
      )}
    </Page>
  );
}
