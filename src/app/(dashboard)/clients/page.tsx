import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";

export default function ClientsPage() {
  return (
    <div>
      <Header
        title="Clients"
        action={
          <Button size="sm" render={<Link href="/clients/new" />}>
            <Plus className="h-4 w-4 mr-1" />
            New Client
          </Button>
        }
      />
      <div className="p-6">
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">No clients yet.</p>
          <Button size="sm" className="mt-4" render={<Link href="/clients/new" />}>
            Add your first client
          </Button>
        </div>
      </div>
    </div>
  );
}
