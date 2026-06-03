import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase, DollarSign, Clock, TrendingUp } from "lucide-react";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { jobs as jobsTable, quotes as quotesTable } from "@/db/schema";
import { requireOrg } from "@/lib/auth";
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import Link from "next/link";

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export default async function DashboardPage() {
  const { orgId } = await requireOrg();
  const monthStart = startOfMonth(new Date());
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [allJobs, recentJobs, recentQuotes] = await Promise.all([
    db.query.jobs.findMany({ where: eq(jobsTable.orgId, orgId) }),
    db.query.jobs.findMany({
      where: eq(jobsTable.orgId, orgId),
      orderBy: desc(jobsTable.createdAt),
      limit: 5,
      with: { client: { columns: { name: true } } },
    }),
    db.query.quotes.findMany({
      where: and(eq(quotesTable.orgId, orgId), gte(quotesTable.createdAt, thirtyDaysAgo)),
    }),
  ]);

  const jobsThisMonth = allJobs.filter((j) => j.createdAt >= monthStart).length;

  const revenueThisMonth = allJobs
    .filter((j) => j.status === "paid" && j.updatedAt >= monthStart)
    .reduce((sum, j) => sum + Number(j.quotedPrice ?? 0), 0);

  const invoiced = allJobs.filter((j) => j.status === "invoiced");
  const outstanding = invoiced.reduce((sum, j) => sum + Number(j.quotedPrice ?? 0), 0);

  const responded = recentQuotes.filter((q) =>
    ["accepted", "declined", "no_response"].includes(q.status)
  );
  const won = responded.filter((q) => q.status === "accepted").length;
  const winRate = responded.length > 0 ? Math.round((won / responded.length) * 100) : null;

  const stats = [
    { label: "Jobs This Month", value: String(jobsThisMonth), icon: Briefcase, sub: "created this month" },
    { label: "Revenue This Month", value: formatMoney(revenueThisMonth), icon: DollarSign, sub: "paid jobs" },
    { label: "Outstanding Invoices", value: formatMoney(outstanding), icon: Clock, sub: `${invoiced.length} unpaid` },
    { label: "Quote Win Rate", value: winRate == null ? "—" : `${winRate}%`, icon: TrendingUp, sub: "last 30 days" },
  ];

  const unpaid = invoiced.slice(0, 5);

  return (
    <div>
      <Header title="Dashboard" />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">{s.label}</CardTitle>
                <s.icon className="h-4 w-4 text-gray-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">{s.value}</div>
                <p className="text-xs text-gray-500 mt-1">{s.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Recent Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              {recentJobs.length === 0 ? (
                <p className="text-sm text-gray-400">No jobs yet.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {recentJobs.map((job) => (
                    <li key={job.id} className="flex items-center justify-between py-2">
                      <Link href={`/jobs/${job.id}`} className="font-medium text-gray-900 hover:underline">
                        {job.name}
                      </Link>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-500">{job.client?.name ?? "—"}</span>
                        <Badge className={JOB_STATUS_COLORS[job.status]}>
                          {JOB_STATUS_LABELS[job.status]}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Unpaid Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              {unpaid.length === 0 ? (
                <p className="text-sm text-gray-400">No outstanding invoices.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {unpaid.map((job) => (
                    <li key={job.id} className="flex items-center justify-between py-2">
                      <Link href={`/jobs/${job.id}`} className="font-medium text-gray-900 hover:underline">
                        {job.name}
                      </Link>
                      <span className="text-gray-900">{formatMoney(job.quotedPrice)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
