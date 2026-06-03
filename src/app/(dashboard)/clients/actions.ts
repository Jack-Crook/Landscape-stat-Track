"use server";

import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { requireOrg } from "@/lib/auth";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const createClientSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  address: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  phone: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  email: z.preprocess(emptyToUndefined, z.email("Invalid email").optional()),
  notes: z.preprocess(emptyToUndefined, z.string().trim().optional()),
});

export type CreateClientState = {
  errors?: Record<string, string[]>;
  message?: string;
};

/** Lists every client for the current org, alphabetically. */
export async function listClients() {
  const { orgId } = await requireOrg();
  return db.query.clients.findMany({
    where: eq(clients.orgId, orgId),
    orderBy: asc(clients.name),
  });
}

/**
 * Creates a client from the new-client form. Returns `{ errors }` for
 * `useActionState` on validation failure; on success revalidates and redirects.
 */
export async function createClient(
  _prevState: CreateClientState,
  formData: FormData
): Promise<CreateClientState> {
  const { orgId } = await requireOrg();

  const parsed = createClientSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const data = parsed.data;

  await db.insert(clients).values({
    orgId,
    name: data.name,
    address: data.address ?? null,
    phone: data.phone ?? null,
    email: data.email ?? null,
    notes: data.notes ?? null,
  });

  revalidatePath("/clients");
  redirect("/clients");
}
