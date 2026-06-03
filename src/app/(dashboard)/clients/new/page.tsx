import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function NewClientPage() {
  return (
    <div>
      <Header title="New Client" />
      <div className="p-6 max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Client Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" placeholder="e.g. John Smith" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="address">Address</Label>
              <Input id="address" placeholder="123 Main St, Suburb QLD 4000" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" type="tel" placeholder="04xx xxx xxx" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="john@example.com" />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                rows={3}
                placeholder="Anything worth remembering about this client..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit">Save Client</Button>
              <Button variant="outline" render={<Link href="/clients" />}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
