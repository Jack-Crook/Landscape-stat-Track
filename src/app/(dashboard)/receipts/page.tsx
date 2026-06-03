import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { formatMoney, formatDate } from "@/lib/format";
import { listReceipts } from "./actions";
import Link from "next/link";
import { Plus } from "lucide-react";

export default async function ReceiptsPage() {
  const receipts = await listReceipts();

  return (
    <div>
      <Header
        title="Receipts"
        action={
          <Button size="sm" render={<Link href="/receipts/new" />}>
            <Plus className="h-4 w-4 mr-1" />
            Log Receipt
          </Button>
        }
      />
      <div className="p-6">
        {receipts.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-sm">No receipts logged yet.</p>
            <Button size="sm" className="mt-4" render={<Link href="/receipts/new" />}>
              Log your first receipt
            </Button>
          </div>
        ) : (
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Vendor</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Job</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">GST</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {receipts.map((receipt) => (
                  <tr key={receipt.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{formatDate(receipt.date)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{receipt.vendor}</td>
                    <td className="px-4 py-3 text-gray-600">{receipt.category ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {receipt.job ? (
                        <Link href={`/jobs/${receipt.job.id}`} className="hover:underline">
                          {receipt.job.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{formatMoney(receipt.gstAmount)}</td>
                    <td className="px-4 py-3 text-right text-gray-900">{formatMoney(receipt.total)}</td>
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
