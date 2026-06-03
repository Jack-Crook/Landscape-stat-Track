import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS } from "@/lib/constants";
import { formatMoney, formatDate } from "@/lib/format";
import { listJobs } from "./actions";
import Link from "next/link";
import { Plus } from "lucide-react";

export default async function JobsPage() {
  const jobs = await listJobs();

  return (
    <div>
      <Header
        title="Jobs"
        action={
          <Button size="sm" render={<Link href="/jobs/new" />}>
            <Plus className="h-4 w-4 mr-1" />
            New Job
          </Button>
        }
      />
      <div className="p-6">
        {jobs.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-sm">No jobs yet.</p>
            <Button size="sm" className="mt-4" render={<Link href="/jobs/new" />}>
              Create your first job
            </Button>
          </div>
        ) : (
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Job</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Quoted</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/jobs/${job.id}`} className="font-medium text-gray-900 hover:underline">
                        {job.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{job.client?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{job.category ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge className={JOB_STATUS_COLORS[job.status]}>
                        {JOB_STATUS_LABELS[job.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900">{formatMoney(job.quotedPrice)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(job.startDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
