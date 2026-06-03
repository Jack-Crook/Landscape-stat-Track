import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_COLORS } from "@/lib/constants";
import { formatMoney, formatDate } from "@/lib/format";
import { listQuotes, updateQuoteStatus, convertQuoteToJob } from "./actions";
import Link from "next/link";
import { Plus } from "lucide-react";

export default async function QuotesPage() {
  const quotes = await listQuotes();

  return (
    <div>
      <Header
        title="Quotes"
        action={
          <Button size="sm" render={<Link href="/quotes/new" />}>
            <Plus className="h-4 w-4 mr-1" />
            New Quote
          </Button>
        }
      />
      <div className="p-6">
        {quotes.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-sm">No quotes yet.</p>
            <Button size="sm" className="mt-4" render={<Link href="/quotes/new" />}>
              Create your first quote
            </Button>
          </div>
        ) : (
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Quote</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Valid Until</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {quotes.map((quote) => (
                  <tr key={quote.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{quote.title}</td>
                    <td className="px-4 py-3 text-gray-600">{quote.client?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge className={QUOTE_STATUS_COLORS[quote.status]}>
                        {QUOTE_STATUS_LABELS[quote.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(quote.validUntil)}</td>
                    <td className="px-4 py-3 text-right text-gray-900">{formatMoney(quote.total)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {quote.status === "draft" && (
                          <StatusButton quoteId={quote.id} status="sent" label="Mark Sent" />
                        )}
                        {quote.status === "sent" && (
                          <>
                            <StatusButton quoteId={quote.id} status="accepted" label="Accepted" />
                            <StatusButton quoteId={quote.id} status="declined" label="Declined" variant="outline" />
                          </>
                        )}
                        {quote.status === "accepted" && !quote.jobId && (
                          <form
                            action={async () => {
                              "use server";
                              await convertQuoteToJob(quote.id);
                            }}
                          >
                            <Button type="submit" size="sm">Convert to Job</Button>
                          </form>
                        )}
                        {quote.jobId && (
                          <Button size="sm" variant="outline" render={<Link href={`/jobs/${quote.jobId}`} />}>
                            View Job
                          </Button>
                        )}
                      </div>
                    </td>
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

function StatusButton({
  quoteId,
  status,
  label,
  variant = "default",
}: {
  quoteId: string;
  status: string;
  label: string;
  variant?: "default" | "outline";
}) {
  return (
    <form
      action={async () => {
        "use server";
        await updateQuoteStatus(quoteId, status);
      }}
    >
      <Button type="submit" size="sm" variant={variant}>
        {label}
      </Button>
    </form>
  );
}
