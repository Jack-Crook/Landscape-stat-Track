import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_COLORS } from "@/lib/constants";
import Link from "next/link";
import { Plus } from "lucide-react";

export default function QuotesPage() {
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
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">No quotes yet.</p>
          <Button size="sm" className="mt-4" render={<Link href="/quotes/new" />}>
            Create your first quote
          </Button>
        </div>
      </div>
    </div>
  );
}
