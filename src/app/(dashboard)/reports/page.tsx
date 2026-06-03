import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ReportsPage() {
  return (
    <div>
      <Header title="Reports" />
      <div className="p-6 space-y-6">
        <Tabs defaultValue="month">
          <TabsList>
            <TabsTrigger value="week">This Week</TabsTrigger>
            <TabsTrigger value="month">This Month</TabsTrigger>
            <TabsTrigger value="fy">Financial Year</TabsTrigger>
            <TabsTrigger value="custom">Custom</TabsTrigger>
          </TabsList>

          {["week", "month", "fy", "custom"].map((tab) => (
            <TabsContent key={tab} value={tab} className="mt-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Revenue", value: "$0.00" },
                  { label: "Costs", value: "$0.00" },
                  { label: "GST Collected", value: "$0.00" },
                  { label: "Net Profit", value: "$0.00" },
                ].map((s) => (
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
                  <p className="text-sm text-gray-400">No data for this period yet.</p>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
