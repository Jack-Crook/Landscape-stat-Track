import { and, desc, eq, gt, gte, isNull, lt, or } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { receipts } from "@/db/schema";
import { getOrg } from "@/lib/auth";
import { basisOf, loadLedger } from "@/lib/data/ledger";
import { expenseBreakdown } from "@/lib/data/expenses";
import { GST_REGISTRATION_THRESHOLD_CENTS, projectAnnual, summarisePeriod } from "@/lib/finance";
import { estimateIncomeTax } from "@/lib/tax";
import { formatCents, formatDate, formatPercent, formatRelativeDays } from "@/lib/format";
import { toCents } from "@/lib/money";
import { basMonths, basQuarters, fyLabel, fyRange, fyStartYear } from "@/lib/periods";
import { TAX_INVOICE_THRESHOLD_CENTS } from "@/lib/receipts/normalize";
import { cn } from "@/lib/utils";
import { KeyValue, Notice, Page, PageHeader, Pill, Row, Section, Segmented, StatTile } from "@/components/kit/ui";

export const metadata = { title: "Tax & GST" };

export default async function TaxPage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  const org = await getOrg();
  const sp = await searchParams;
  const now = new Date();
  const currentFy = fyStartYear(now);
  const fy = sp.fy === "last" ? currentFy - 1 : currentFy;
  const fyR = fyRange(fy);
  const basis = basisOf(org);
  const ledger = await loadLedger(org.id);
  const input = { ...ledger, basis, gstRegistered: org.gstRegistered };

  const year = summarisePeriod({ ...input, range: fyR });
  const periods = (org.basFrequency === "monthly" ? basMonths(fy) : basQuarters(fy)).map((p) => ({ ...p, s: summarisePeriod({ ...input, range: p }) }));
  const current = periods.find((p) => now >= p.start && now < p.end);
  const isCurrentFy = fy === currentFy;

  // Income tax: estimate on the year so far, plus a straight-line full-year projection.
  const tax = estimateIncomeTax({ businessProfit: year.profit / 100, otherIncome: Number(org.otherIncome), entityType: org.entityType, fyStartYear: fy });
  const projectedProfit = isCurrentFy ? projectAnnual(year.profit, fyR.start, now) : year.profit;
  const projectedTax = estimateIncomeTax({ businessProfit: projectedProfit / 100, otherIncome: Number(org.otherIncome), entityType: org.entityType, fyStartYear: fy });

  // GST registration watch (turnover = sales excluding GST).
  const projectedTurnover = isCurrentFy ? projectAnnual(year.salesEx, fyR.start, now) : year.salesEx;

  const breakdown = await expenseBreakdown(org.id, fyR, org.gstRegistered, ledger);

  // GST credits at risk: big receipts with GST but no supplier ABN.
  const atRisk = org.gstRegistered
    ? await db
        .select({ id: receipts.id, vendor: receipts.vendor, date: receipts.date, total: receipts.total, gst: receipts.gstAmount })
        .from(receipts)
        .where(
          and(
            eq(receipts.orgId, org.id),
            eq(receipts.status, "confirmed"),
            gte(receipts.date, fyR.start),
            lt(receipts.date, fyR.end),
            gt(receipts.total, (TAX_INVOICE_THRESHOLD_CENTS / 100).toFixed(2)),
            gt(receipts.gstAmount, "0"),
            or(isNull(receipts.vendorAbn), eq(receipts.vendorAbn, ""))
          )
        )
        .orderBy(desc(receipts.gstAmount))
        .limit(20)
    : [];

  return (
    <Page wide>
      <PageHeader title="Tax & GST" subtitle={`${fyLabel(fy)} · ${basis} basis${org.gstRegistered ? ` · ${org.basFrequency} BAS` : " · not GST registered"}`} />
      <Segmented
        className="mb-6"
        label="Financial year"
        value={fy === currentFy ? "this" : "last"}
        options={[
          { value: "this", label: `This year (${fyLabel(currentFy)})`, href: "/tax" },
          { value: "last", label: `Last year (${fyLabel(currentFy - 1)})`, href: "/tax?fy=last" },
        ]}
      />

      <Notice tone="info" title="Estimates to plan with, not tax advice">
        Figures come from what you&apos;ve recorded here. Check them with your accountant or BAS agent before lodging.{" "}
        <Link href="/settings" className="font-medium text-tint-ink">
          Tax settings
        </Link>
      </Notice>

      {org.gstRegistered && current && isCurrentFy && (
        <Section title={`This ${org.basFrequency === "monthly" ? "month" : "quarter"} so far (${current.label})`}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="footnote text-label-2">{current.s.netGst >= 0 ? "GST to pay so far" : "GST refund so far"}</div>
              <div className={cn("hero-figure", current.s.netGst < 0 && "text-good")}>{formatCents(Math.abs(current.s.netGst))}</div>
              <div className="footnote mt-1 text-label-2">
                BAS due {formatDate(current.due)} ({formatRelativeDays(current.due, now)})
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-right sm:grid-cols-3">
              <KeyValue label="GST on sales (1A)" value={formatCents(current.s.salesGst)} />
              <KeyValue label="GST credits (1B)" value={formatCents(current.s.gstCredits)} />
              <KeyValue label="Sales (G1)" value={formatCents(current.s.salesInc)} />
            </dl>
          </div>
        </Section>
      )}

      {org.gstRegistered ? (
        <Section title="BAS by period" flush footer="G1 total sales and G10/G11 purchases include GST. Lodge by the due dates shown (BAS agents often get longer).">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[14px]">
              <thead className="footnote text-left text-label-2">
                <tr className="border-b border-separator">
                  <th className="px-4 py-2.5 font-medium">Period</th>
                  <th className="px-2 py-2.5 text-right font-medium">G1 sales</th>
                  <th className="px-2 py-2.5 text-right font-medium">1A GST</th>
                  <th className="px-2 py-2.5 text-right font-medium">G10 capital</th>
                  <th className="px-2 py-2.5 text-right font-medium">G11 other</th>
                  <th className="px-2 py-2.5 text-right font-medium">1B credits</th>
                  <th className="px-4 py-2.5 text-right font-medium">Net GST</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-separator">
                {periods.map((p) => {
                  const past = p.end <= now;
                  const isNow = now >= p.start && now < p.end;
                  return (
                    <tr key={p.key} className={cn(isNow && "bg-tint-soft")}>
                      <td className="px-4 py-3">
                        <div className="font-semibold">{p.label}</div>
                        <div className="footnote text-label-2">
                          Due {formatDate(p.due)}
                          {past && p.due > now && <Pill tone="orange" className="ml-1.5">Lodge now</Pill>}
                          {isNow && <Pill tone="green" className="ml-1.5">Current</Pill>}
                        </div>
                      </td>
                      <td className="num px-2 py-3 text-right">{formatCents(p.s.salesInc)}</td>
                      <td className="num px-2 py-3 text-right">{formatCents(p.s.salesGst)}</td>
                      <td className="num px-2 py-3 text-right">{formatCents(p.s.capitalInc)}</td>
                      <td className="num px-2 py-3 text-right">{formatCents(p.s.nonCapitalInc)}</td>
                      <td className="num px-2 py-3 text-right">{formatCents(p.s.gstCredits)}</td>
                      <td className={cn("num px-4 py-3 text-right font-semibold", p.s.netGst < 0 && "text-good")}>
                        {p.s.netGst < 0 ? `${formatCents(-p.s.netGst)} back` : formatCents(p.s.netGst)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-separator font-semibold">
                  <td className="px-4 py-3">Year</td>
                  <td className="num px-2 py-3 text-right">{formatCents(year.salesInc)}</td>
                  <td className="num px-2 py-3 text-right">{formatCents(year.salesGst)}</td>
                  <td className="num px-2 py-3 text-right">{formatCents(year.capitalInc)}</td>
                  <td className="num px-2 py-3 text-right">{formatCents(year.nonCapitalInc)}</td>
                  <td className="num px-2 py-3 text-right">{formatCents(year.gstCredits)}</td>
                  <td className="num px-4 py-3 text-right">{formatCents(year.netGst)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Section>
      ) : (
        <Section title="GST registration watch" footer="You must register for GST within 21 days of your turnover reaching (or being likely to reach) $75,000 a year.">
          <div className="grid gap-4 sm:grid-cols-2">
            <KeyValue label="Turnover this year" value={formatCents(year.salesEx)} />
            <KeyValue label={isCurrentFy ? "Projected for the year" : "Full year"} value={formatCents(projectedTurnover)} tone={projectedTurnover >= GST_REGISTRATION_THRESHOLD_CENTS ? "bad" : undefined} />
          </div>
          <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-fill" role="meter" aria-valuemin={0} aria-valuemax={75000} aria-valuenow={Math.round(projectedTurnover / 100)} aria-label="Projected turnover against the $75,000 threshold">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, (projectedTurnover / GST_REGISTRATION_THRESHOLD_CENTS) * 100)}%`,
                background: projectedTurnover >= GST_REGISTRATION_THRESHOLD_CENTS ? "var(--bad)" : projectedTurnover >= GST_REGISTRATION_THRESHOLD_CENTS * 0.8 ? "var(--warn)" : "var(--tint)",
              }}
            />
          </div>
          <p className="footnote mt-2 text-label-2">
            {projectedTurnover >= GST_REGISTRATION_THRESHOLD_CENTS
              ? "You're on track to pass $75,000. Talk to your accountant about registering."
              : `${formatPercent((projectedTurnover / GST_REGISTRATION_THRESHOLD_CENTS) * 100)} of the $75,000 threshold.`}
          </p>
        </Section>
      )}

      <div className="grid gap-x-6 lg:grid-cols-2">
        <Section title="Income tax estimate" footer={org.entityType === "company" ? "Company base rate entity: 25% of profit." : "Sole trader: resident rates, Medicare levy, low income and small business offsets. Ignores HELP debts, PAYG instalments and losses."}>
          <div className="grid grid-cols-2 gap-4">
            <StatTile label="Profit so far" value={formatCents(year.profit)} tone={year.profit < 0 ? "bad" : undefined} />
            <StatTile label="Tax on it so far" value={formatCents(Math.round(tax.businessTax * 100))} hint={tax.setAsideRate > 0 ? `${(tax.setAsideRate * 100).toFixed(0)}% of profit` : undefined} />
          </div>
          {isCurrentFy && (
            <dl className="mt-4 space-y-2 border-t border-separator pt-4">
              <div className="flex justify-between">
                <dt className="text-label-2">Projected full-year profit</dt>
                <dd className="num font-medium">{formatCents(projectedProfit)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-label-2">Projected tax for the year</dt>
                <dd className="num font-medium">{formatCents(Math.round(projectedTax.businessTax * 100))}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-label-2">Marginal rate</dt>
                <dd className="num font-medium">{formatPercent(projectedTax.marginalRate * 100)}</dd>
              </div>
            </dl>
          )}
          {projectedTax.setAsideRate > 0 && (
            <p className="mt-4 rounded-xl bg-tint-soft p-3 font-medium text-tint-ink">
              Put aside about {Math.ceil(projectedTax.setAsideRate * 100)}% of each payment&apos;s profit for income tax
              {org.gstRegistered ? ", plus the GST you collect" : ""}.
            </p>
          )}
        </Section>

        <Section title="Deductions this year" flush>
          {breakdown.lines.length === 0 ? (
            <p className="p-4 text-label-2">No expenses recorded yet.</p>
          ) : (
            breakdown.lines.map((l) => (
              <Row
                key={l.key}
                title={l.label}
                subtitle={!l.deductible ? "Usually not deductible" : org.gstRegistered && l.gst > 0 ? `GST credit ${formatCents(l.gst)}` : undefined}
                detail={<span className={cn("font-semibold", l.deductible ? "text-label" : "text-label-3 line-through")}>{formatCents(l.amount)}</span>}
              />
            ))
          )}
          <div className="flex justify-between border-t border-separator px-4 py-3 font-semibold">
            <span>Total deductible</span>
            <span className="num">{formatCents(breakdown.deductible)}</span>
          </div>
        </Section>
      </div>

      {atRisk.length > 0 && (
        <Section title="GST credits at risk" flush footer="Purchases over $82.50 need a tax invoice showing the supplier's ABN before you can claim the GST. Add the ABN, or ask the supplier for a tax invoice.">
          {atRisk.map((r) => (
            <Row key={r.id} href={`/receipts/${r.id}`} title={r.vendor} subtitle={formatDate(r.date)} detail={<span className="font-semibold text-warn">{formatCents(toCents(r.gst))} GST</span>} />
          ))}
        </Section>
      )}
    </Page>
  );
}
