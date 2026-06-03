import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase, DollarSign, Clock, TrendingUp } from "lucide-react";

const stats = [
  {
    label: "Jobs This Month",
    value: "—",
    icon: Briefcase,
    sub: "Connect your database to see data",
  },
  {
    label: "Revenue This Month",
    value: "—",
    icon: DollarSign,
    sub: "vs last month",
  },
  {
    label: "Outstanding Invoices",
    value: "—",
    icon: Clock,
    sub: "unpaid",
  },
  {
    label: "Quote Win Rate",
    value: "—",
    icon: TrendingUp,
    sub: "last 30 days",
  },
];

export default function DashboardPage() {
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
              <p className="text-sm text-gray-400">No jobs yet.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Unpaid Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-400">No outstanding invoices.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
