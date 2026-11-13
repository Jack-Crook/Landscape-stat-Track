import { Lightbulb } from "lucide-react";
import { getOrg } from "@/lib/auth";
import { loadLedger } from "@/lib/data/ledger";
import { loadInsights } from "@/lib/data/insights";
import { formatCents, formatDate, formatPercent } from "@/lib/format";
import { daysBetween } from "@/lib/periods";
import { cn } from "@/lib/utils";
import { EmptyState, LinkButton, Page, PageHeader, Row, Section, StatTile } from "@/components/kit/ui";
import { BarList, ColumnChart } from "@/components/charts/charts";

export const metadata = { title: "Insights" };

export default async function InsightsPage() {
  const org = await getOrg();
  const ledger = await loadLedger(org.id);
  const ins = await loadInsights(org.id, org.gstRegistered, ledger);
  const now = new Date();

  if (ins.finishedJobs === 0 && ins.quotes.decided === 0) {
    return (
      <Page>
        <PageHeader title="Insights" />
        <Section>
          <EmptyState
            icon={<Lightbulb />}
            title="Insights appear as you work"
            body="Finish a few priced jobs and record quote outcomes to see your best-paying work, win rates, cost blowouts and slow payers."
            action={<LinkButton href="/jobs">Go to jobs</LinkButton>}
          />
        </Section>
      </Page>
    );
  }

  const best = ins.byCategory.filter((c) => c.jobs >= 1 && c.margin != null).sort((a, b) => (b.profitPerHour ?? b.margin! * 100) - (a.profitPerHour ?? a.margin! * 100))[0];
  const busiest = [...ins.seasonality].sort((a, b) => b.average - a.average)[0];
  const quietest = [...ins.seasonality].filter((s) => s.average > 0).sort((a, b) => a.average - b.average)[0];

  return (
    <Page wide>
      <PageHeader title="Insights" subtitle={`From ${ins.finishedJobs} finished job${ins.finishedJobs === 1 ? "" : "s"} and ${ins.quotes.decided} quote decision${ins.quotes.decided === 1 ? "" : "s"}`} />

      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Quote win rate" value={formatPercent(ins.quotes.winRate)} hint={`${ins.quotes.won} of ${ins.quotes.decided}`} />
        <StatTile label="Profit per hour" value={ins.profitPerHour == null ? "—" : formatCents(ins.profitPerHour)} hint={ins.totalHours ? `Across ${Math.round(ins.totalHours)} hours logged` : "Log hours on jobs"} />
        <StatTile
          label="Costs vs estimates"
          value={ins.avgVariancePct == null ? "—" : `${ins.avgVariancePct > 0 ? "+" : ""}${ins.avgVariancePct.toFixed(0)}%`}
          tone={ins.avgVariancePct != null && ins.avgVariancePct > 10 ? "bad" : undefined}
          hint="Average over/under"
        />
        <StatTile label="Clients reply in" value={ins.quotes.medianResponseDays == null ? "—" : `${Math.round(ins.quotes.medianResponseDays)} days`} hint="Median, quote sent → decision" />
      </div>

      {best && (
        <p className="mb-6 rounded-2xl bg-tint-soft p-4 font-medium text-tint-ink">
          Your best-paying work is <strong>{best.category}</strong>
          {best.profitPerHour != null ? ` at ${formatCents(best.profitPerHour)} profit an hour` : ` at a ${best.margin!.toFixed(0)}% margin`}.
          {busiest && busiest.average > 0 && ` ${busiest.label} is usually your biggest month${quietest && quietest.label !== busiest.label ? `, ${quietest.label} your quietest` : ""}.`}
        </p>
      )}

      <Section title="By kind of work" flush footer="Margin = profit ÷ revenue. Win rate counts quotes marked accepted, declined or no response.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[14px]">
            <thead className="footnote text-left text-label-2">
              <tr className="border-b border-separator">
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-2 py-2.5 text-right font-medium">Jobs</th>
                <th className="px-2 py-2.5 text-right font-medium">Profit</th>
                <th className="px-2 py-2.5 text-right font-medium">Margin</th>
                <th className="px-2 py-2.5 text-right font-medium">Per hour</th>
                <th className="px-2 py-2.5 text-right font-medium">Win rate</th>
                <th className="px-4 py-2.5 text-right font-medium">Over budget</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-separator">
              {ins.byCategory.map((c) => (
                <tr key={c.category}>
                  <td className="px-4 py-3 font-medium">{c.category}</td>
                  <td className="num px-2 py-3 text-right">{c.jobs}</td>
                  <td className={cn("num px-2 py-3 text-right", c.profit < 0 && "text-bad")}>{formatCents(c.profit)}</td>
                  <td className={cn("num px-2 py-3 text-right", c.margin != null && c.margin < 15 && "text-bad")}>{formatPercent(c.margin)}</td>
                  <td className="num px-2 py-3 text-right">{c.profitPerHour == null ? "—" : formatCents(c.profitPerHour)}</td>
                  <td className="num px-2 py-3 text-right">{c.winRate == null ? "—" : `${c.winRate.toFixed(0)}% (${c.quotesWon}/${c.quotesSent})`}</td>
                  <td className={cn("num px-4 py-3 text-right", c.overBudget > 0 && "text-warn")}>{c.overBudget || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-x-6 lg:grid-cols-2">
        <Section title="Win rate by quote size">
          <BarList
            caption="Quote win rate by price band"
            color="var(--series-3)"
            valueFormat="percent"
            items={ins.quotes.bands
              .filter((b) => b.sent > 0)
              .map((b) => ({ key: b.label, label: b.label, value: b.rate ?? 0, sub: `${b.won} won of ${b.sent}` }))}
          />
          {ins.quotes.bands.every((b) => b.sent === 0) && <p className="text-label-2">Record quote outcomes to see this.</p>}
        </Section>

        <Section title="Average income by month" footer="Paid income (ex GST) per calendar month, averaged across years.">
          <ColumnChart
            height={180}
            caption="Average income by calendar month"
            series={[{ key: "avg", name: "Average income", color: "var(--series-1)" }]}
            data={ins.seasonality.map((s) => ({ label: s.label, values: { avg: s.average } }))}
          />
        </Section>
      </div>

      {ins.blowouts.length > 0 && (
        <Section title="Jobs that cost more than expected" flush footer="Use these to sharpen your quoting. Look at what drove the extra cost.">
          {ins.blowouts.map((b) => (
            <Row
              key={b.id}
              href={`/jobs/${b.id}`}
              title={b.name}
              subtitle={`Expected ${formatCents(b.estimated)} · actual ${formatCents(b.actual)}`}
              detail={<span className="font-semibold text-bad">+{formatCents(b.variance)}</span>}
            />
          ))}
        </Section>
      )}

      <div className="grid gap-x-6 lg:grid-cols-2">
        <Section title="Best clients" flush>
          {ins.clients.length === 0 ? (
            <p className="p-4 text-label-2">No paid invoices yet.</p>
          ) : (
            ins.clients.slice(0, 8).map((c) => (
              <Row
                key={c.id}
                href={`/clients/${c.id}`}
                title={c.name}
                subtitle={`${c.invoices} invoice${c.invoices === 1 ? "" : "s"}${c.medianDays != null ? ` · pays in ~${Math.round(c.medianDays)} days` : ""}`}
                detail={<span className="font-semibold text-label">{formatCents(c.paid)}</span>}
              />
            ))
          )}
        </Section>
        <Section title="Slow payers" flush>
          {ins.slowPayers.length === 0 ? (
            <p className="p-4 text-label-2">Everyone pays on time. Nice.</p>
          ) : (
            ins.slowPayers.slice(0, 8).map((c) => (
              <Row
                key={c.id}
                href={`/clients/${c.id}`}
                title={c.name}
                subtitle={c.medianDays != null ? `Usually ${Math.round(c.medianDays)} days to pay` : "Hasn't paid yet"}
                detail={c.overdue > 0 ? <span className="font-semibold text-bad">{formatCents(c.overdue)} overdue</span> : undefined}
              />
            ))
          )}
        </Section>
      </div>

      {ins.quotes.stale.length > 0 && (
        <Section title="Quotes to follow up" flush footer="Sent a week or more ago with no answer. A quick call often wins the job.">
          {ins.quotes.stale.map((q) => (
            <Row
              key={q.id}
              href={`/quotes/${q.id}`}
              title={q.title}
              subtitle={`${q.number ?? ""} · sent ${formatDate(q.sentAt)} (${daysBetween(q.sentAt, now)} days ago)`}
              detail={formatCents(q.total)}
            />
          ))}
        </Section>
      )}
    </Page>
  );
}
