import { and, desc, eq, type SQL } from "drizzle-orm";
import { ScrollText } from "lucide-react";
import { db } from "@/db";
import { clients, invoices } from "@/db/schema";
import { getOrg } from "@/lib/auth";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_TONES } from "@/lib/constants";
import { formatCents, formatDate, formatRelativeDays } from "@/lib/format";
import { toCents } from "@/lib/money";
import { EmptyState, LinkButton, Page, PageHeader, Pill, Row, Section, Segmented, StatTile } from "@/components/kit/ui";

export const metadata = { title: "Invoices" };

const FILTERS = [
  { value: "open", label: "Unpaid" },
  { value: "overdue", label: "Overdue" },
  { value: "draft", label: "Drafts" },
  { value: "paid", label: "Paid" },
  { value: "all", label: "All" },
];

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const org = await getOrg();
  const sp = await searchParams;
  const filter = FILTERS.some((f) => f.value === sp.status) ? sp.status! : "open";
  const now = new Date();

  const conds: SQL[] = [eq(invoices.orgId, org.id)];
  if (filter === "open" || filter === "overdue") conds.push(eq(invoices.status, "sent"));
  if (filter === "draft") conds.push(eq(invoices.status, "draft"));
  if (filter === "paid") conds.push(eq(invoices.status, "paid"));

  const [rowsRaw, all] = await Promise.all([
    db
      .select({ inv: invoices, clientName: clients.name })
      .from(invoices)
      .leftJoin(clients, eq(clients.id, invoices.clientId))
      .where(and(...conds))
      .orderBy(desc(invoices.issueDate), desc(invoices.number))
      .limit(300),
    db.select({ status: invoices.status, total: invoices.total, dueDate: invoices.dueDate, paidAt: invoices.paidAt }).from(invoices).where(eq(invoices.orgId, org.id)),
  ]);
  const rows = filter === "overdue" ? rowsRaw.filter((r) => r.inv.dueDate && r.inv.dueDate < now) : rowsRaw;

  const open = all.filter((i) => i.status === "sent");
  const overdue = open.filter((i) => i.dueDate && i.dueDate < now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const paidThisMonth = all.filter((i) => i.status === "paid" && i.paidAt && i.paidAt >= monthStart);

  return (
    <Page>
      <PageHeader title="Invoices" actions={<LinkButton href="/invoices/new">New invoice</LinkButton>} />
      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatTile label="Unpaid" value={formatCents(open.reduce((s, i) => s + toCents(i.total), 0))} hint={`${open.length} invoice${open.length === 1 ? "" : "s"}`} href="/invoices?status=open" />
        <StatTile
          label="Overdue"
          value={formatCents(overdue.reduce((s, i) => s + toCents(i.total), 0))}
          tone={overdue.length ? "bad" : undefined}
          hint={`${overdue.length} invoice${overdue.length === 1 ? "" : "s"}`}
          href="/invoices?status=overdue"
        />
        <StatTile label="Paid this month" value={formatCents(paidThisMonth.reduce((s, i) => s + toCents(i.total), 0))} hint={`${paidThisMonth.length} payment${paidThisMonth.length === 1 ? "" : "s"}`} />
      </div>
      <Segmented className="mb-4" label="Filter invoices" value={filter} options={FILTERS.map((f) => ({ ...f, href: `/invoices?status=${f.value}` }))} />
      {rows.length === 0 ? (
        <Section>
          <EmptyState
            icon={<ScrollText />}
            title={filter === "overdue" ? "Nothing overdue" : "No invoices here"}
            body="Invoice a job from its page, or tap Invoiced on the job's progress bar."
            action={<LinkButton href="/invoices/new">New invoice</LinkButton>}
          />
        </Section>
      ) : (
        <Section flush>
          {rows.map(({ inv, clientName }) => {
            const late = inv.status === "sent" && inv.dueDate && inv.dueDate < now;
            return (
              <Row
                key={inv.id}
                href={`/invoices/${inv.id}`}
                title={`${inv.number}${clientName ? ` · ${clientName}` : ""}`}
                subtitle={
                  inv.status === "paid"
                    ? `Paid ${formatDate(inv.paidAt)}`
                    : inv.status === "sent" && inv.dueDate
                      ? `Due ${formatRelativeDays(inv.dueDate, now)} (${formatDate(inv.dueDate)})`
                      : `Issued ${formatDate(inv.issueDate)}`
                }
                detail={<span className="font-semibold text-label">{formatCents(toCents(inv.total))}</span>}
                trailing={late ? <Pill tone="red">Overdue</Pill> : <Pill tone={INVOICE_STATUS_TONES[inv.status]}>{INVOICE_STATUS_LABELS[inv.status]}</Pill>}
              />
            );
          })}
        </Section>
      )}
    </Page>
  );
}
