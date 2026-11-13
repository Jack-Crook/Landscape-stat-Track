import { and, desc, eq, type SQL } from "drizzle-orm";
import { FileText } from "lucide-react";
import { db } from "@/db";
import { clients, quotes } from "@/db/schema";
import { getOrg } from "@/lib/auth";
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_TONES, QUOTE_STATUSES } from "@/lib/constants";
import { formatCents, formatDate, formatPercent } from "@/lib/format";
import { toCents } from "@/lib/money";
import { daysBetween } from "@/lib/periods";
import { EmptyState, LinkButton, Page, PageHeader, Pill, Row, Section, Segmented, StatTile } from "@/components/kit/ui";

export const metadata = { title: "Quotes" };

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const org = await getOrg();
  const sp = await searchParams;
  const status = (QUOTE_STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status! : "all";

  const conds: SQL[] = [eq(quotes.orgId, org.id)];
  if (status !== "all") conds.push(eq(quotes.status, status as (typeof QUOTE_STATUSES)[number]));
  const [rows, all] = await Promise.all([
    db
      .select({ quote: quotes, clientName: clients.name })
      .from(quotes)
      .leftJoin(clients, eq(clients.id, quotes.clientId))
      .where(and(...conds))
      .orderBy(desc(quotes.createdAt))
      .limit(300),
    db.select({ status: quotes.status, total: quotes.total, sentAt: quotes.sentAt }).from(quotes).where(eq(quotes.orgId, org.id)),
  ]);

  const decided = all.filter((q) => ["accepted", "declined", "no_response"].includes(q.status));
  const winRate = decided.length ? (decided.filter((q) => q.status === "accepted").length / decided.length) * 100 : null;
  const open = all.filter((q) => q.status === "sent");
  const now = new Date();
  const stale = open.filter((q) => q.sentAt && daysBetween(q.sentAt, now) >= 7).length;

  return (
    <Page>
      <PageHeader title="Quotes" actions={<LinkButton href="/quotes/new">New quote</LinkButton>} />
      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatTile label="Win rate" value={formatPercent(winRate)} hint={`${decided.length} decided`} />
        <StatTile label="Awaiting reply" value={String(open.length)} hint={formatCents(open.reduce((s, q) => s + toCents(q.total), 0))} />
        <StatTile label="Follow up" value={String(stale)} tone={stale ? "warn" : undefined} hint="Sent 7+ days ago" />
      </div>
      <Segmented
        className="mb-4"
        label="Filter quotes"
        value={status}
        options={[{ value: "all", label: "All", href: "/quotes" }, ...QUOTE_STATUSES.map((s) => ({ value: s, label: QUOTE_STATUS_LABELS[s], href: `/quotes?status=${s}` }))]}
      />
      {rows.length === 0 ? (
        <Section>
          <EmptyState
            icon={<FileText />}
            title="No quotes here"
            body="Quotes track your win rate and turn into jobs in one tap once accepted."
            action={<LinkButton href="/quotes/new">New quote</LinkButton>}
          />
        </Section>
      ) : (
        <Section flush>
          {rows.map(({ quote: q, clientName }) => (
            <Row
              key={q.id}
              href={`/quotes/${q.id}`}
              title={q.title}
              subtitle={[q.number, clientName, formatDate(q.createdAt)].filter(Boolean).join(" · ")}
              detail={<span className="font-semibold text-label">{formatCents(toCents(q.total))}</span>}
              trailing={<Pill tone={QUOTE_STATUS_TONES[q.status]}>{QUOTE_STATUS_LABELS[q.status]}</Pill>}
            />
          ))}
        </Section>
      )}
    </Page>
  );
}
