"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import { createQuote, type CreateQuoteState, type QuoteLineItem } from "../actions";
import { DEFAULT_TAX_RATE } from "@/lib/constants";

type ClientOption = { id: string; name: string };

const initialState: CreateQuoteState = {};

const AUD = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="text-xs text-red-600">{messages[0]}</p>;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save Quote"}
    </Button>
  );
}

const emptyRow: QuoteLineItem = { description: "", quantity: 1, unitPrice: 0 };

export function NewQuoteForm({ clients }: { clients: ClientOption[] }) {
  const [state, formAction] = useActionState(createQuote, initialState);
  const [items, setItems] = useState<QuoteLineItem[]>([{ ...emptyRow }]);

  const update = (i: number, patch: Partial<QuoteLineItem>) =>
    setItems((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setItems((rows) => [...rows, { ...emptyRow }]);
  const removeRow = (i: number) =>
    setItems((rows) => (rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows));

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const gst = subtotal * DEFAULT_TAX_RATE;
  const total = subtotal + gst;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="lineItems" value={JSON.stringify(items)} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quote Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" placeholder="e.g. Backyard landscaping — Smith" />
            <FieldError messages={state.errors?.title} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="clientId">Client</Label>
              <select
                id="clientId"
                name="clientId"
                defaultValue=""
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">No client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="validUntil">Valid until</Label>
              <Input id="validUntil" name="validUntil" type="date" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Line Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="grid grid-cols-[1fr_80px_110px_90px_auto] gap-2 items-center">
              <Input
                placeholder="Description"
                value={item.description}
                onChange={(e) => update(i, { description: e.target.value })}
              />
              <Input
                type="number"
                min="0"
                step="1"
                placeholder="Qty"
                value={item.quantity}
                onChange={(e) => update(i, { quantity: Number(e.target.value) })}
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Unit $"
                value={item.unitPrice}
                onChange={(e) => update(i, { unitPrice: Number(e.target.value) })}
              />
              <span className="text-sm text-right text-gray-700">
                {AUD.format(item.quantity * item.unitPrice)}
              </span>
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="text-gray-400 hover:text-red-600"
                aria-label="Remove line item"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-4 w-4 mr-1" />
            Add line
          </Button>
          <FieldError messages={state.errors?.lineItems} />

          <div className="border-t pt-3 space-y-1 text-sm max-w-xs ml-auto">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{AUD.format(subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>GST ({DEFAULT_TAX_RATE * 100}%)</span>
              <span>{AUD.format(gst)}</span>
            </div>
            <div className="flex justify-between font-semibold text-gray-900">
              <span>Total</span>
              <span>{AUD.format(total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-1">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              placeholder="Terms, inclusions, etc."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
          <div className="flex gap-3">
            <SubmitButton />
            <Button variant="outline" render={<Link href="/quotes" />}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
