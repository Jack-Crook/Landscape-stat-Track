"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createJob, type CreateJobState } from "../actions";

type ClientOption = { id: string; name: string };

const initialState: CreateJobState = {};

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="text-xs text-red-600">{messages[0]}</p>;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating…" : "Create Job"}
    </Button>
  );
}

export function NewJobForm({ clients }: { clients: ClientOption[] }) {
  const [state, formAction] = useActionState(createJob, initialState);

  return (
    <form action={formAction}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Job Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Job name</Label>
            <Input id="name" name="name" placeholder="e.g. Front lawn mow — Smith" />
            <FieldError messages={state.errors?.name} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="clientId">Client</Label>
            <select
              id="clientId"
              name="clientId"
              defaultValue=""
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <FieldError messages={state.errors?.clientId} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="category">Category</Label>
              <Input id="category" name="category" placeholder="e.g. Mowing" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="quotedPrice">Quoted price ($)</Label>
              <Input id="quotedPrice" name="quotedPrice" type="number" step="0.01" placeholder="0.00" />
              <FieldError messages={state.errors?.quotedPrice} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              rows={3}
              placeholder="Job notes..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="startDate">Start date</Label>
              <Input id="startDate" name="startDate" type="date" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="endDate">End date</Label>
              <Input id="endDate" name="endDate" type="date" />
            </div>
          </div>
          {state.message && <p className="text-xs text-red-600">{state.message}</p>}
          <div className="flex gap-3 pt-2">
            <SubmitButton />
            <Button variant="outline" render={<Link href="/jobs" />}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
