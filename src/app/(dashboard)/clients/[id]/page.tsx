import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Mail, MapPin, Phone } from "lucide-react";
import { db } from "@/db";
import { clients, invoices, jobs, quotes } from "@/db/schema";
import { getOrg } from "@/lib/auth";
import { median } from "@/lib/finance";
import { toCents } from "@/lib/money";
import { daysBetween } from "@/lib/periods";
import { formatCents, formatDate } from "@/lib/format";
import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_TONES,
  JOB_STATUS_LABELS,
  JOB_STATUS_TONES,
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_TONES,
} from "@/lib/constants";
import { LinkButton, Page, PageHeader, Pill, Row, Section, StatTile } from "@/components/kit/ui";
import { ConfirmSubmit } from "@/components/kit/client";
import { ClientForm } from "../client-form";
import { deleteClient } from "../actions";

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const org = await getOrg();
  const { id } = await params;
  const { edit } = await searchParams;
  const client = await db.query.clients.findFirst({ where: and(eq(clients.id, id), eq(clients.orgId, org.id)) });
  if (!client) notFound();

  if (edit) {
    return (
      <Page>
        <PageHeader title="Edit client" back={{ href: `/clients/${id}`, label: client.name }} />
        <ClientForm client={client} />
        <form action={deleteClient} className="mt-8 flex justify-center">
          <input type="hidden" name="id" value={client.id} />
          <ConfirmSubmit confirmText="Tap again to delete client">Delete client</ConfirmSubmit>
        </form>
        <p className="footnote mt-2 text-center text-label-2">Jobs, quotes and invoices stay, just without a client.</p>
      </Page>
    );
  }

  const [clientJobs, clientInvoices, clientQuotes] = await Promise.all([
    db.query.jobs.findMany({ where: and(eq(jobs.orgId, org.id), eq(jobs.clientId, id)), orderBy: desc(jobs.createdAt) }),
    db.query.invoices.findMany({ where: and(eq(invoices.orgId, org.id), eq(invoices.clientId, id)), orderBy: desc(invoices.issueDate) }),
    db.query.quotes.findMany({ where: and(eq(quotes.orgId, org.id), eq(quotes.clientId, id)), orderBy: desc(quotes.createdAt) }),
  ]);

  const paid = clientInvoices.filter((i) => i.status === "paid");
  const lifetime = paid.reduce((s, i) => s + toCents(i.total), 0);
  const owing = clientInvoices.filter((i) => i.status === "sent").reduce((s, i) => s + toCents(i.total), 0);
  const now = new Date();
  const overdue = clientInvoices.filter((i) => i.status === "sent" && i.dueDate && i.dueDate < now);
  const daysToPay = median(paid.filter((i) => i.paidAt).map((i) => daysBetween(i.issueDate, i.paidAt!)));
  const profit = clientJobs.reduce((s, j) => s + toCents(j.profit), 0);
  const decided = clientQuotes.filter((q) => ["accepted", "declined", "no_response"].includes(q.status));
  const winRate = decided.length ? (decided.filter((q) => q.status === "accepted").length / decided.length) * 100 : null;

  return (
    <Page>
      <PageHeader
        title={client.name}
        back={{ href: "/clients", label: "Clients" }}
        actions={
          <>
            <LinkButton href={`/clients/${id}?edit=1`} variant="gray">
              Edit
            </LinkButton>
            <LinkButton href={`/quotes/new?clientId=${id}`} variant="tinted">
              New quote
            </LinkButton>
            <LinkButton href={`/jobs/new?clientId=${id}`}>New job</LinkButton>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {client.phone && (
          <LinkButton href={`tel:${client.phone.replace(/\s/g, "")}`} variant="gray" size="sm">
            <Phone className="h-4 w-4" /> {client.phone}
          </LinkButton>
        )}
        {client.email && (
          <LinkButton href={`mailto:${client.email}`} variant="gray" size="sm">
            <Mail className="h-4 w-4" /> {client.email}
          </LinkButton>
        )}
        {client.address && (
          <LinkButton href={`https://maps.apple.com/?q=${encodeURIComponent(client.address)}`} variant="gray" size="sm" target="_blank">
            <MapPin className="h-4 w-4" /> {client.address}
          </LinkButton>
        )}
      </div>

      <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Lifetime paid" value={formatCents(lifetime)} hint={`${paid.length} invoice${paid.length === 1 ? "" : "s"}`} />
        <StatTile label="Owing" value={formatCents(owing)} tone={overdue.length ? "bad" : undefined} hint={overdue.length ? `${overdue.length} overdue` : "Nothing overdue"} />
        <StatTile label="Profit from jobs" value={formatCents(profit)} tone={profit < 0 ? "bad" : undefined} hint={`${clientJobs.length} job${clientJobs.length === 1 ? "" : "s"}`} />
        <StatTile
          label="Usually pays in"
          value={daysToPay == null ? "—" : `${Math.round(daysToPay)} days`}
          hint={winRate == null ? "No quote decisions yet" : `Accepts ${winRate.toFixed(0)}% of quotes`}
        />
      </div>

      {client.notes && (
        <Section title="Notes">
          <p className="whitespace-pre-wrap">{client.notes}</p>
        </Section>
      )}

      <Section title="Jobs" flush action={<a href={`/jobs/new?clientId=${id}`}>Add</a>}>
        {clientJobs.length === 0 ? (
          <p className="p-4 text-label-2">No jobs yet.</p>
        ) : (
          clientJobs.map((j) => (
            <Row
              key={j.id}
              href={`/jobs/${j.id}`}
              title={j.name}
              subtitle={formatDate(j.startDate ?? j.createdAt)}
              detail={j.quotedPrice ? formatCents(toCents(j.quotedPrice)) : undefined}
              trailing={<Pill tone={JOB_STATUS_TONES[j.status]}>{JOB_STATUS_LABELS[j.status]}</Pill>}
            />
          ))
        )}
      </Section>

      {clientInvoices.length > 0 && (
        <Section title="Invoices" flush>
          {clientInvoices.map((i) => (
            <Row
              key={i.id}
              href={`/invoices/${i.id}`}
              title={i.number}
              subtitle={`Issued ${formatDate(i.issueDate)}${i.paidAt ? ` · paid ${formatDate(i.paidAt)}` : ""}`}
              detail={formatCents(toCents(i.total))}
              trailing={<Pill tone={INVOICE_STATUS_TONES[i.status]}>{INVOICE_STATUS_LABELS[i.status]}</Pill>}
            />
          ))}
        </Section>
      )}

      {clientQuotes.length > 0 && (
        <Section title="Quotes" flush>
          {clientQuotes.map((q) => (
            <Row
              key={q.id}
              href={`/quotes/${q.id}`}
              title={q.title}
              subtitle={formatDate(q.createdAt)}
              detail={formatCents(toCents(q.total))}
              trailing={<Pill tone={QUOTE_STATUS_TONES[q.status]}>{QUOTE_STATUS_LABELS[q.status]}</Pill>}
            />
          ))}
        </Section>
      )}
    </Page>
  );
}
