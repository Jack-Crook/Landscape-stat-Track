import { and, eq } from "drizzle-orm";
import { Download } from "lucide-react";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { getOrg } from "@/lib/auth";
import { basisOf, loadLedger } from "@/lib/data/ledger";
import { expenseBreakdown } from "@/lib/data/expenses";
import { seriesByRange, summarisePeriod } from "@/lib/finance";
import { formatCents, formatPercent } from "@/lib/format";
import { toCents } from "@/lib/money";
import { inRange, lastMonths, monthRange, resolvePeriod, toDateInput } from "@/lib/periods";
import { cn } from "@/lib/utils";
import { LinkButton, Money, Page, PageHeader, Row, Section, Segmented, StatTile } from "@/components/kit/ui";
import { ColumnChart } from "@/components/charts/charts";

export const metadata = { title: "Profit & loss" };

const PERIODS = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "fy", label: "This FY" },
  { value: "last-fy", label: "Last FY" },
  { value: "custom", label: "Custom" },
];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const org = await getOrg();
  const sp = await searchParams;
  const now = new Date();
  const period = resolvePeriod(sp.period, now, { from: sp.from, to: sp.to });
  const basis = basisOf(org);
  const ledger = await loadLedger(org.id);
  const s = summarisePeriod({ ...ledger, range: period, basis, gstRegistered: org.gstRegistered });
  const breakdown = await expenseBreakdown(org.id, period, org.gstRegistered, ledger);
  const margin = s.salesEx > 0 ? (s.profit / s.salesEx) * 100 : null;

  // Monthly chart: the months the period covers (at most 12), or the last 12 for short periods.
  const months: ReturnType<typeof lastMonths> = [];
  for (let d = new Date(period.start.getFullYear(), period.start.getMonth(), 1); d < period.end && months.length < 24; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const r = monthRange(d.getFullYear(), d.getMonth());
    months.push({ ...r, label: d.toLocaleDateString("en-AU", { month: "short" }) });
  }
  const chartMonths = months.length >= 3 ? months.slice(-12) : lastMonths(now, 12);
  const series = seriesByRange(chartMonths, { ...ledger, basis, gstRegistered: org.gstRegistered });

  const periodJobs = (await db.query.jobs.findMany({ where: and(eq(jobs.orgId, org.id)), with: { client: { columns: { name: true } } } }))
    .filter((j) => inRange(j.completedAt ?? j.endDate ?? j.startDate, period) && j.quotedPrice != null)
    .sort((a, b) => toCents(b.profit) - toCents(a.profit));

  const exportQs = `from=${toDateInput(period.start)}&to=${toDateInput(new Date(period.end.getTime() - 86_400_000))}`;

  return (
    <Page wide>
      <PageHeader
        title="Profit & loss"
        subtitle={`${period.label} · ${basis === "cash" ? "cash basis (income when paid)" : "accrual basis (income when invoiced)"}`}
        actions={
          <LinkButton href={`/api/export/pl?${exportQs}`} variant="gray" download>
            <Download className="h-4 w-4" /> CSV
          </LinkButton>
        }
      />
      <div className="mb-6 space-y-3">
        <Segmented label="Period" value={period.key} options={PERIODS.map((p) => ({ ...p, href: p.value === "custom" ? `/reports?period=custom&from=${toDateInput(period.start)}&to=${toDateInput(new Date(period.end.getTime() - 86_400_000))}` : `/reports?period=${p.value}` }))} />
        {period.key === "custom" && (
          <form className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="period" value="custom" />
            <label>
              <span className="footnote mb-1 block px-1 text-label-2">From</span>
              <input type="date" name="from" defaultValue={sp.from ?? toDateInput(period.start)} className="field" />
            </label>
            <label>
              <span className="footnote mb-1 block px-1 text-label-2">To</span>
              <input type="date" name="to" defaultValue={sp.to ?? toDateInput(new Date(period.end.getTime() - 86_400_000))} className="field" />
            </label>
            <button className="pressable h-11 rounded-full bg-fill px-4 font-semibold">Show</button>
          </form>
        )}
      </div>

      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={org.gstRegistered ? "Income (ex GST)" : "Income"} value={formatCents(s.salesEx)} hint={`${s.invoiceCount} invoice${s.invoiceCount === 1 ? "" : "s"}`} />
        <StatTile label="Expenses" value={formatCents(s.expenses)} hint={`${s.receiptCount} receipts + job costs`} />
        <StatTile label="Net profit" value={<Money cents={s.profit} />} tone={s.profit < 0 ? "bad" : "good"} />
        <StatTile label="Margin" value={formatPercent(margin)} hint="Profit ÷ income" />
      </div>

      <Section title="Income vs expenses by month">
        <ColumnChart
          caption="Income and expenses by month"
          series={[
            { key: "income", name: "Income", color: "var(--series-1)" },
            { key: "expenses", name: "Expenses", color: "var(--series-2)" },
          ]}
          data={series.map((m) => ({ label: m.label, values: { income: m.salesEx, expenses: m.expenses } }))}
        />
      </Section>

      <div className="grid gap-x-6 lg:grid-cols-[3fr_2fr]">
        <Section title="Statement">
          <table className="w-full text-[15px]">
            <tbody>
              <tr>
                <th colSpan={2} className="pb-1 text-left font-semibold">
                  Income
                </th>
              </tr>
              <tr className="text-label-2">
                <td className="py-1 pl-3">Sales{org.gstRegistered ? " (ex GST)" : ""}</td>
                <td className="num py-1 text-right">{formatCents(s.salesEx)}</td>
              </tr>
              <tr>
                <th colSpan={2} className="pb-1 pt-4 text-left font-semibold">
                  Expenses{org.gstRegistered ? " (ex GST)" : ""}
                </th>
              </tr>
              {breakdown.lines.length === 0 && (
                <tr>
                  <td className="py-1 pl-3 text-label-3" colSpan={2}>
                    None recorded
                  </td>
                </tr>
              )}
              {breakdown.lines.map((l) => (
                <tr key={l.key} className="text-label-2">
                  <td className="py-1 pl-3">
                    {l.label}
                    {!l.deductible && <span className="caption ml-1.5 rounded bg-fill px-1.5 py-0.5">not deductible</span>}
                  </td>
                  <td className="num py-1 text-right">{formatCents(l.amount)}</td>
                </tr>
              ))}
              <tr className="border-t border-separator">
                <td className="pt-2 font-semibold">Total deductible expenses</td>
                <td className="num pt-2 text-right font-semibold">{formatCents(s.expenses)}</td>
              </tr>
              <tr className="border-t-2 border-label">
                <td className="headline pt-3">Net profit</td>
                <td className={cn("num headline pt-3 text-right", s.profit < 0 && "text-bad")}>
                  <Money cents={s.profit} />
                </td>
              </tr>
            </tbody>
          </table>
          {s.nonDeductible > 0 && <p className="footnote mt-3 text-label-2">{formatCents(s.nonDeductible)} of food and drink is left out of expenses as it&apos;s usually not deductible.</p>}
        </Section>

        <Section title="GST in this period">
          {org.gstRegistered ? (
            <dl className="space-y-2">
              <div className="flex justify-between">
                <dt className="text-label-2">GST collected</dt>
                <dd className="num">{formatCents(s.salesGst)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-label-2">GST credits</dt>
                <dd className="num">−{formatCents(s.gstCredits)}</dd>
              </div>
              <div className="flex justify-between border-t border-separator pt-2 font-semibold">
                <dt>{s.netGst >= 0 ? "Owed to the ATO" : "Refund due"}</dt>
                <dd className="num">{formatCents(Math.abs(s.netGst))}</dd>
              </div>
              <p className="footnote pt-1 text-label-2">
                See <a href="/tax" className="font-medium text-tint-ink">Tax &amp; GST</a> for BAS figures by quarter.
              </p>
            </dl>
          ) : (
            <p className="text-label-2">You&apos;re not registered for GST, so none is collected or claimed.</p>
          )}
        </Section>
      </div>

      <Section title={`Jobs finished in this period (${periodJobs.length})`} flush>
        {periodJobs.length === 0 ? (
          <p className="p-4 text-label-2">No priced jobs finished in this period.</p>
        ) : (
          periodJobs.map((j) => {
            const price = toCents(j.quotedPrice);
            const rev = org.gstRegistered ? price - Math.round(price / 11) : price;
            const profit = toCents(j.profit);
            return (
              <Row
                key={j.id}
                href={`/jobs/${j.id}`}
                title={j.name}
                subtitle={[j.client?.name, j.category].filter(Boolean).join(" · ")}
                detail={
                  <div>
                    <div className={cn("font-semibold", profit < 0 ? "text-bad" : "text-label")}>{formatCents(profit)}</div>
                    <div className="footnote">{rev > 0 ? `${((profit / rev) * 100).toFixed(0)}% of ${formatCents(rev)}` : "—"}</div>
                  </div>
                }
              />
            );
          })
        )}
      </Section>

      <Section title="Export for your accountant" footer="CSV files open in Excel or Numbers.">
        <div className="flex flex-wrap gap-2">
          <LinkButton href={`/api/export/receipts?${exportQs}`} variant="gray" size="sm" download>
            Receipts
          </LinkButton>
          <LinkButton href={`/api/export/items?${exportQs}`} variant="gray" size="sm" download>
            Receipt items
          </LinkButton>
          <LinkButton href={`/api/export/invoices?${exportQs}`} variant="gray" size="sm" download>
            Invoices
          </LinkButton>
          <LinkButton href={`/api/export/jobs?${exportQs}`} variant="gray" size="sm" download>
            Jobs
          </LinkButton>
          <LinkButton href={`/api/export/pl?${exportQs}`} variant="gray" size="sm" download>
            Profit &amp; loss
          </LinkButton>
        </div>
      </Section>
    </Page>
  );
}
