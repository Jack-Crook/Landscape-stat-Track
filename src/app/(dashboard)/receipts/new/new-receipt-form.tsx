"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createReceipt, type CreateReceiptState } from "../actions";

type JobOption = { id: string; name: string };

const initialState: CreateReceiptState = {};

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="text-xs text-red-600">{messages[0]}</p>;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save Receipt"}
    </Button>
  );
}

export function NewReceiptForm({ jobs }: { jobs: JobOption[] }) {
  const [state, formAction] = useActionState(createReceipt, initialState);

  return (
    <form action={formAction}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Receipt Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="vendor">Vendor</Label>
              <Input id="vendor" name="vendor" placeholder="e.g. Bunnings" />
              <FieldError messages={state.errors?.vendor} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="date">Date</Label>
              <Input id="date" name="date" type="date" />
              <FieldError messages={state.errors?.date} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="total">Total ($)</Label>
              <Input id="total" name="total" type="number" step="0.01" min="0" placeholder="0.00" />
              <FieldError messages={state.errors?.total} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="gstAmount">GST ($) — optional</Label>
              <Input id="gstAmount" name="gstAmount" type="number" step="0.01" min="0" placeholder="auto (1/11)" />
              <FieldError messages={state.errors?.gstAmount} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="category">Category</Label>
              <Input id="category" name="category" placeholder="e.g. Fuel, Materials" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="jobId">Link to job — optional</Label>
              <select
                id="jobId"
                name="jobId"
                defaultValue=""
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">General expense</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              placeholder="Anything worth noting..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <SubmitButton />
            <Button variant="outline" render={<Link href="/receipts" />}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
