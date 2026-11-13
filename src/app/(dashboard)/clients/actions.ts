"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { requireOrg } from "@/lib/auth";
import { checkbox, formObject, invalid, optionalText, requiredText, type FormState } from "@/lib/actions";

const clientSchema = z.object({
  name: requiredText("Client name is required"),
  email: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().email("Enter a valid email").optional()),
  phone: optionalText,
  address: optionalText,
  notes: optionalText,
  isPreferred: checkbox,
});

export async function saveClient(_prev: FormState, formData: FormData): Promise<FormState> {
  const { orgId } = await requireOrg();
  const id = formData.get("id");
  const parsed = clientSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const values = {
    name: d.name,
    email: d.email ?? null,
    phone: d.phone ?? null,
    address: d.address ?? null,
    notes: d.notes ?? null,
    isPreferred: d.isPreferred,
    updatedAt: new Date(),
  };

  let clientId: string;
  if (typeof id === "string" && id) {
    const [row] = await db
      .update(clients)
      .set(values)
      .where(and(eq(clients.id, id), eq(clients.orgId, orgId)))
      .returning({ id: clients.id });
    if (!row) return { ok: false, message: "Client not found" };
    clientId = row.id;
  } else {
    const [row] = await db.insert(clients).values({ ...values, orgId }).returning({ id: clients.id });
    clientId = row.id;
  }

  revalidatePath("/clients");
  const returnTo = formData.get("returnTo");
  redirect(typeof returnTo === "string" && returnTo.startsWith("/") ? returnTo : `/clients/${clientId}`);
}

export async function deleteClient(formData: FormData) {
  const { orgId } = await requireOrg();
  const id = String(formData.get("id") ?? "");
  await db.delete(clients).where(and(eq(clients.id, id), eq(clients.orgId, orgId)));
  revalidatePath("/clients");
  redirect("/clients");
}
