import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";

export default function ReceiptsPage() {
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
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">No receipts logged yet.</p>
          <Button size="sm" className="mt-4" render={<Link href="/receipts/new" />}>
            Log your first receipt
          </Button>
        </div>
      </div>
    </div>
  );
}
