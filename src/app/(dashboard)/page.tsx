import { and, asc, count, desc, eq, gte, lt } from "drizzle-orm";
import Link from "next/link";
import { AlertCircle, Camera, ChevronRight, FileText, Receipt, ScrollText, Sparkles } from "lucide-react";
import { db } from "@/db";
import { clients, jobs, quotes, receipts } from "@/db/schema";
import { getOrg } from "@/lib/auth";
import { basisOf, loadLedger } from "@/lib/data/ledger";
import { seriesByRange, summarisePeriod } from "@/lib/finance";
import { estimateIncomeTax } from "@/lib/tax";
import { formatCents, formatCentsWhole, formatDate, formatDateShort, formatPercent } from "@/lib/format";
import { toCents } from "@/lib/money";
import { addDays, currentBasPeriod, daysBetween, fyLabel, fyRange, fyStartYear, lastMonths, monthRange } from "@/lib/periods";
import { JOB_STATUS_LABELS, JOB_STATUS_TONES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { IconBadge, LinkButton, Money, Page, Pill, Row, Section, StatTile } from "@/components/kit/ui";
import { ColumnChart, Sparkline } from "@/components/charts/charts";

export const metadata = { title: "Home" };

function greeting(d: Date) {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function HomePage() {
  const org = await getOrg();
  const now = new Date();
  const basis = basisOf(org);
  const ledger = await loadLedger(org.id);
  const input = { ...ledger, basis, gstRegistered: org.gstRegistered };

  const fy = fyStartYear(now);
  const fyR = fyRange(fy);
  const year = summarisePeriod({ ...input, range: fyR });
  const lastYearSameTime = summarisePeriod({ ...input, range: { start: fyRange(fy - 1).start, end: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() + 1) } });
  const month = summarisePeriod({ ...input, range: monthRange(now.getFullYear(), now.getMonth()) });
  const bas = currentBasPeriod(now, org.basFrequency);
  const basSummary = summarisePeriod({ ...input, range: bas });
  const months = seriesByRange(lastMonths(now, 12), input);
  const tax = estimateIncomeTax({ businessProfit: year.profit / 100, otherIncome: Number(org.otherIncome), entityType: org.entityType, fyStartYear: fy });

  const unpaid = ledger.invoices.filter((i) => i.status === "sent");
  const overdue = unpaid.filter((i) => i.dueDate && i.dueDate < now);

  const [[{ value: reviewCount }], staleQuotes, toInvoice, upcoming, recentReceipts] = await Promise.all([
    db.select({ value: count() }).from(receipts).where(and(eq(receipts.orgId, org.id), eq(receipts.status, "needs_review"))),
    db.select({ id: quotes.id, sentAt: quotes.sentAt }).from(quotes).where(and(eq(quotes.orgId, org.id), eq(quotes.status, "sent"))),
    db.select({ id: jobs.id, name: jobs.name }).from(jobs).where(and(eq(jobs.orgId, org.id), eq(jobs.status, "completed"))),
    db
      .select({ job: jobs, clientName: clients.name })
      .from(jobs)
      .leftJoin(clients, eq(clients.id, jobs.clientId))
      .where(and(eq(jobs.orgId, org.id), gte(jobs.startDate, addDays(now, -1)), lt(jobs.startDate, addDays(now, 14))))
      .orderBy(asc(jobs.startDate))
      .limit(6),
    db
      .select({ id: receipts.id, vendor: receipts.vendor, date: receipts.date, total: receipts.total })
      .from(receipts)
      .where(and(eq(receipts.orgId, org.id), eq(receipts.status, "confirmed")))
      .orderBy(desc(receipts.date))
      .limit(5),
  ]);
  const followUps = staleQuotes.filter((q) => q.sentAt && daysBetween(q.sentAt, now) >= 7);

  const attention = [
    reviewCount > 0 && { href: "/receipts", icon: <Receipt />, color: "var(--series-2)", title: `${reviewCount} receipt${reviewCount === 1 ? "" : "s"} to review`, sub: "Scanned and waiting for a quick check" },
    overdue.length > 0 && {
      href: "/invoices?status=overdue",
      icon: <AlertCircle />,
      color: "var(--bad)",
      title: `${overdue.length} overdue invoice${overdue.length === 1 ? "" : "s"}`,
      sub: `${formatCents(overdue.reduce((s, i) => s + toCents(i.total), 0))} to chase`,
    },
    toInvoice.length > 0 && {
      href: toInvoice.length === 1 ? `/jobs/${toInvoice[0].id}` : "/jobs?status=completed",
      icon: <ScrollText />,
      color: "var(--series-7)",
      title: `${toInvoice.length} finished job${toInvoice.length === 1 ? "" : "s"} not invoiced`,
      sub: toInvoice.length === 1 ? toInvoice[0].name : "Send the invoices to get paid sooner",
    },
    followUps.length > 0 && { href: "/insights", icon: <FileText />, color: "var(--series-1)", title: `${followUps.length} quote${followUps.length === 1 ? "" : "s"} to follow up`, sub: "Sent over a week ago" },
  ].filter(Boolean) as { href: string; icon: React.ReactNode; color: string; title: string; sub: string }[];

  const profitDelta = lastYearSameTime.profit !== 0 ? ((year.profit - lastYearSameTime.profit) / Math.abs(lastYearSameTime.profit)) * 100 : null;
  const margin = year.salesEx > 0 ? (year.profit / year.salesEx) * 100 : null;
  const setAside = Math.round(tax.businessTax * 100) + (org.gstRegistered ? Math.max(0, basSummary.netGst) : 0);

  return (
    <Page wide>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="footnote font-semibold uppercase tracking-wide text-label-2">{now.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="large-title">{greeting(now)}</h1>
        </div>
        <div className="flex gap-2">
          <LinkButton href="/quotes/new" variant="gray">
            New quote
          </LinkButton>
          <LinkButton href="/receipts/scan">
            <Camera className="h-4 w-4" /> Scan receipt
          </LinkButton>
        </div>
      </header>

      {/* Hero */}
      <section className="mb-6 rounded-3xl bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="footnote font-medium text-label-2">Profit this financial year · {fyLabel(fy)}</p>
            <p className={cn("hero-figure mt-1", year.profit < 0 && "text-bad")} data-testid="hero-profit">
              <Money cents={year.profit} />
            </p>
            <p className="footnote mt-1.5 text-label-2">
              {formatCentsWhole(year.salesEx)} income − {formatCentsWhole(year.expenses)} expenses
              {margin != null && ` · ${formatPercent(margin)} margin`}
              {profitDelta != null && (
                <span className={cn("ml-1 font-semibold", profitDelta >= 0 ? "text-good" : "text-bad")}>
                  · {profitDelta >= 0 ? "▲" : "▼"} {Math.abs(profitDelta).toFixed(0)}% on last year
                </span>
              )}
            </p>
          </div>
          <div className="w-full max-w-xs">
            <Sparkline values={months.map((m) => m.profit)} accent="var(--tint)" height={40} />
            <p className="caption mt-1 text-right text-label-3">Monthly profit, last 12 months</p>
          </div>
        </div>
      </section>

      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Income this month" value={formatCents(month.salesEx)} hint={`${month.invoiceCount} paid`} href="/reports?period=month" />
        <StatTile label="Spent this month" value={formatCents(month.expenses)} hint={`${month.receiptCount} receipts`} href="/spending?period=month" />
        {org.gstRegistered ? (
          <StatTile
            label={`GST ${basSummary.netGst >= 0 ? "owing" : "refund"} · ${bas.label}`}
            value={formatCents(Math.abs(basSummary.netGst))}
            hint={`BAS due ${formatDateShort(bas.due)}`}
            href="/tax"
          />
        ) : (
          <StatTile label="Turnover this FY" value={formatCents(year.salesEx)} hint="GST threshold $75,000" href="/tax" />
        )}
        <StatTile label="Put aside for tax" value={formatCents(setAside)} hint={org.gstRegistered ? "Income tax so far + this BAS" : "Income tax so far (estimate)"} href="/tax" />
      </div>

      {attention.length > 0 && (
        <Section title="Needs attention" flush>
          {attention.map((a) => (
            <Row key={a.title} href={a.href} leading={<IconBadge color={a.color}>{a.icon}</IconBadge>} title={a.title} subtitle={a.sub} />
          ))}
        </Section>
      )}

      <div className="grid gap-x-6 lg:grid-cols-[3fr_2fr]">
        <Section title="Income vs expenses" action={<Link href="/reports">Profit &amp; loss</Link>}>
          <ColumnChart
            caption="Income and expenses, last 12 months"
            series={[
              { key: "income", name: "Income", color: "var(--series-1)" },
              { key: "expenses", name: "Expenses", color: "var(--series-2)" },
            ]}
            data={months.map((m) => ({ label: m.label, values: { income: m.salesEx, expenses: m.expenses } }))}
          />
        </Section>

        <div>
          <Section title="Money owed to you" flush action={<Link href="/invoices">Invoices</Link>}>
            <div className="px-4 pb-3 pt-4">
              <p className="title-2 num">{formatCents(unpaid.reduce((s, i) => s + toCents(i.total), 0))}</p>
              <p className="footnote text-label-2">
                {unpaid.length} unpaid invoice{unpaid.length === 1 ? "" : "s"}
                {overdue.length > 0 && <span className="font-semibold text-bad"> · {overdue.length} overdue</span>}
              </p>
            </div>
          </Section>

          <Section title="Coming up" flush action={<Link href="/jobs">All jobs</Link>}>
            {upcoming.length === 0 ? (
              <p className="p-4 text-label-2">Nothing scheduled in the next two weeks.</p>
            ) : (
              upcoming.map(({ job, clientName }) => (
                <Row
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  leading={
                    <div className="w-10 text-center">
                      <div className="caption font-semibold uppercase text-bad">{job.startDate!.toLocaleDateString("en-AU", { weekday: "short" })}</div>
                      <div className="headline leading-none">{job.startDate!.getDate()}</div>
                    </div>
                  }
                  title={job.name}
                  subtitle={clientName ?? job.siteAddress ?? undefined}
                  trailing={<Pill tone={JOB_STATUS_TONES[job.status]}>{JOB_STATUS_LABELS[job.status]}</Pill>}
                />
              ))
            )}
          </Section>
        </div>
      </div>

      <Section title="Recent receipts" flush action={<Link href="/receipts">All receipts</Link>}>
        {recentReceipts.length === 0 ? (
          <Link href="/receipts/scan" className="row-press flex items-center gap-3 p-4">
            <IconBadge color="var(--tint)">
              <Sparkles />
            </IconBadge>
            <span className="flex-1">
              <span className="block font-medium">Scan your first receipt</span>
              <span className="footnote text-label-2">Every item is read and stored, so spending reports build themselves.</span>
            </span>
            <ChevronRight className="h-4 w-4 text-label-3" />
          </Link>
        ) : (
          recentReceipts.map((r) => (
            <Row
              key={r.id}
              href={`/receipts/${r.id}`}
              leading={
                <IconBadge color="var(--series-2)">
                  <Receipt />
                </IconBadge>
              }
              title={r.vendor}
              subtitle={formatDate(r.date)}
              detail={formatCents(toCents(r.total))}
            />
          ))
        )}
      </Section>
    </Page>
  );
}
