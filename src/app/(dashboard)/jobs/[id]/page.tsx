import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  JOB_STATUS_LABELS,
  JOB_STATUS_COLORS,
  COST_TYPE_LABELS,
  DEFAULT_MILEAGE_RATE,
} from "@/lib/constants";
import { formatMoney, formatDate } from "@/lib/format";
import {
  getJob,
  updateJobStatus,
  addCostLine,
  deleteCostLine,
  addMileage,
  deleteMileage,
} from "../actions";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";

const STATUS_PIPELINE = ["quoted", "in_progress", "completed", "invoiced", "paid"] as const;
const COST_TYPES = ["materials", "labour", "travel", "other"] as const;

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();

  return (
    <div>
      <Header
        title={job.name}
        action={
          <Button variant="outline" size="sm" render={<Link href="/jobs" />}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        }
      />
      <div className="p-6 space-y-6 max-w-4xl">
        {/* Status pipeline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {STATUS_PIPELINE.map((status) => {
                const isCurrent = job.status === status;
                return (
                  <form
                    key={status}
                    action={async () => {
                      "use server";
                      await updateJobStatus(job.id, status);
                    }}
                  >
                    <Button
                      type="submit"
                      size="sm"
                      variant={isCurrent ? "default" : "outline"}
                      disabled={isCurrent}
                    >
                      {JOB_STATUS_LABELS[status]}
                    </Button>
                  </form>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Summary</CardTitle>
            <Badge className={JOB_STATUS_COLORS[job.status]}>
              {JOB_STATUS_LABELS[job.status]}
            </Badge>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <Field label="Client" value={job.client?.name ?? "—"} />
            <Field label="Category" value={job.category ?? "—"} />
            <Field label="Quoted" value={formatMoney(job.quotedPrice)} />
            <Field label="Actual cost" value={formatMoney(job.actualCost)} />
            <Field
              label="Profit"
              value={formatMoney(job.profit)}
              valueClass={
                job.profit != null
                  ? Number(job.profit) >= 0
                    ? "text-green-700"
                    : "text-red-700"
                  : undefined
              }
            />
            <Field label="Start" value={formatDate(job.startDate)} />
            <Field label="End" value={formatDate(job.endDate)} />
          </CardContent>
          {job.description && (
            <CardContent className="pt-0 text-sm text-gray-600">
              {job.description}
            </CardContent>
          )}
        </Card>

        {/* Cost lines */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Cost Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {job.costLines.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="text-left text-gray-500 border-b">
                  <tr>
                    <th className="py-2 font-medium">Type</th>
                    <th className="py-2 font-medium">Description</th>
                    <th className="py-2 font-medium text-right">GST</th>
                    <th className="py-2 font-medium text-right">Amount</th>
                    <th className="py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {job.costLines.map((line) => (
                    <tr key={line.id}>
                      <td className="py-2">{COST_TYPE_LABELS[line.type]}</td>
                      <td className="py-2 text-gray-600">{line.description ?? "—"}</td>
                      <td className="py-2 text-right text-gray-500">{formatMoney(line.gstAmount)}</td>
                      <td className="py-2 text-right">{formatMoney(line.amount)}</td>
                      <td className="py-2 text-right">
                        <form
                          action={async () => {
                            "use server";
                            await deleteCostLine(job.id, line.id);
                          }}
                        >
                          <button type="submit" className="text-gray-400 hover:text-red-600" aria-label="Delete cost line">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-400">No cost lines yet.</p>
            )}

            <form
              action={async (formData: FormData) => {
                "use server";
                await addCostLine(job.id, formData);
              }}
              className="grid grid-cols-1 sm:grid-cols-[140px_1fr_120px_auto] gap-2 items-end border-t pt-4"
            >
              <div className="space-y-1">
                <Label htmlFor="type">Type</Label>
                <select
                  id="type"
                  name="type"
                  defaultValue="materials"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  {COST_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {COST_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="description">Description</Label>
                <Input id="description" name="description" placeholder="e.g. 5x bags mulch" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="amount">Amount ($)</Label>
                <Input id="amount" name="amount" type="number" step="0.01" min="0" required placeholder="0.00" />
              </div>
              <Button type="submit" size="sm">Add</Button>
              <label className="sm:col-span-4 flex items-center gap-2 text-xs text-gray-500">
                <input type="checkbox" name="gstInclusive" defaultChecked className="rounded border-input" />
                Amount includes 10% GST
              </label>
            </form>
          </CardContent>
        </Card>

        {/* Mileage */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Mileage <span className="text-xs font-normal text-gray-400">(${DEFAULT_MILEAGE_RATE.toFixed(2)}/km)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {job.mileageLogs.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="text-left text-gray-500 border-b">
                  <tr>
                    <th className="py-2 font-medium">Distance</th>
                    <th className="py-2 font-medium">Notes</th>
                    <th className="py-2 font-medium text-right">Total</th>
                    <th className="py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {job.mileageLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2">{Number(log.km)} km</td>
                      <td className="py-2 text-gray-600">{log.notes ?? "—"}</td>
                      <td className="py-2 text-right">{formatMoney(log.total)}</td>
                      <td className="py-2 text-right">
                        <form
                          action={async () => {
                            "use server";
                            await deleteMileage(job.id, log.id);
                          }}
                        >
                          <button type="submit" className="text-gray-400 hover:text-red-600" aria-label="Delete mileage log">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-400">No mileage logged yet.</p>
            )}

            <form
              action={async (formData: FormData) => {
                "use server";
                await addMileage(job.id, formData);
              }}
              className="grid grid-cols-1 sm:grid-cols-[120px_1fr_auto] gap-2 items-end border-t pt-4"
            >
              <div className="space-y-1">
                <Label htmlFor="km">Distance (km)</Label>
                <Input id="km" name="km" type="number" step="0.01" min="0" required placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" name="notes" placeholder="e.g. depot → site return" />
              </div>
              <Button type="submit" size="sm">Add</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`font-medium text-gray-900 ${valueClass ?? ""}`}>{value}</p>
    </div>
  );
}
