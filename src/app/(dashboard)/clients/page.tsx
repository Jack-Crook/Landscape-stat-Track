import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listClients } from "./actions";
import Link from "next/link";
import { Plus } from "lucide-react";

export default async function ClientsPage() {
  const clients = await listClients();

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
        {clients.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-sm">No clients yet.</p>
            <Button size="sm" className="mt-4" render={<Link href="/clients/new" />}>
              Add your first client
            </Button>
          </div>
        ) : (
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Address</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {clients.map((client) => (
                  <tr key={client.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {client.name}
                      {client.isPreferred && (
                        <Badge className="ml-2 bg-amber-100 text-amber-800">Preferred</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{client.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{client.email ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{client.address ?? "—"}</td>
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
