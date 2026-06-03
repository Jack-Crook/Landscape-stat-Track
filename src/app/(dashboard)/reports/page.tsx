import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs as jobsTable, receipts as receiptsTable } from "@/db/schema";
import { requireOrg } from "@/lib/auth";
import { DEFAULT_TAX_RATE, AU_FINANCIAL_YEAR_START_MONTH } from "@/lib/constants";
import { formatMoney } from "@/lib/format";

type JobRow = typeof jobsTable.$inferSelect;
type ReceiptRow = typeof receiptsTable.$inferSelect;

const GST_FRACTION = DEFAULT_TAX_RATE / (1 + DEFAULT_TAX_RATE); // inclusive → component

function financialYearStart(now: Date) {
  const fyMonthIndex = AU_FINANCIAL_YEAR_START_MONTH - 1; // July = 6
  const year = now.getMonth() >= fyMonthIndex ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, fyMonthIndex, 1);
}

function computePeriod(jobs: JobRow[], receipts: ReceiptRow[], start: Date) {
  // Revenue recognised when a job is marked paid within the period.
  const paid = jobs.filter((j) => j.status === "paid" && j.updatedAt >= start);
  const revenue = paid.reduce((s, j) => s + Number(j.quotedPrice ?? 0), 0);
  const jobCosts = paid.reduce((s, j) => s + Number(j.actualCost ?? 0), 0);
  // General (non-job) receipts logged in the period add to costs.
  const generalReceipts = receipts
    .filter((r) => !r.jobId && r.date >= start)
    .reduce((s, r) => s + Number(r.total), 0);
  const costs = jobCosts + generalReceipts;
  const gst = revenue * GST_FRACTION;

  return { revenue, costs, gst, profit: revenue - costs, jobs: paid };
}

const TABS = [
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "fy", label: "Financial Year" },
] as const;

export default async function ReportsPage() {
  const { orgId } = await requireOrg();
  const now = new Date();

  const [jobs, receipts] = await Promise.all([
    db.query.jobs.findMany({ where: eq(jobsTable.orgId, orgId) }),
    db.query.receipts.findMany({ where: eq(receiptsTable.orgId, orgId) }),
  ]);

  const starts = {
    week: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    month: new Date(now.getFullYear(), now.getMonth(), 1),
    fy: financialYearStart(now),
  };

  const periods = {
    week: computePeriod(jobs, receipts, starts.week),
    month: computePeriod(jobs, receipts, starts.month),
    fy: computePeriod(jobs, receipts, starts.fy),
  };

  return (
    <div>
      <Header title="Reports" />
      <div className="p-6 space-y-6">
        <Tabs defaultValue="month">
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
            <TabsTrigger value="custom">Custom</TabsTrigger>
          </TabsList>

          {TABS.map((t) => {
            const p = periods[t.value];
            const cards = [
              { label: "Revenue", value: formatMoney(p.revenue) },
              { label: "Costs", value: formatMoney(p.costs) },
              { label: "GST Collected", value: formatMoney(p.gst) },
              { label: "Net Profit", value: formatMoney(p.profit) },
            ];
            return (
              <TabsContent key={t.value} value={t.value} className="mt-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {cards.map((s) => (
                    <Card key={s.label}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">{s.label}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-gray-900">{s.value}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <Card className="mt-4">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Job Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {p.jobs.length === 0 ? (
                      <p className="text-sm text-gray-400">No paid jobs in this period yet.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="text-left text-gray-500 border-b">
                          <tr>
                            <th className="py-2 font-medium">Job</th>
                            <th className="py-2 font-medium text-right">Revenue</th>
                            <th className="py-2 font-medium text-right">Cost</th>
                            <th className="py-2 font-medium text-right">Profit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {p.jobs.map((j) => (
                            <tr key={j.id}>
                              <td className="py-2 text-gray-900">{j.name}</td>
                              <td className="py-2 text-right">{formatMoney(j.quotedPrice)}</td>
                              <td className="py-2 text-right text-gray-500">{formatMoney(j.actualCost)}</td>
                              <td className="py-2 text-right">{formatMoney(j.profit)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}

          <TabsContent value="custom" className="mt-4">
            <Card>
              <CardContent className="py-12 text-center text-sm text-gray-400">
                Custom date-range reports coming soon.
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
