import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organisations, users } from "@/db/schema";

/**
 * Clerk webhook endpoint. Provisions an organisation + owner user when a Clerk
 * account is created, and removes the user row when the account is deleted.
 *
 * This route is unauthenticated (Clerk signs the request) and is whitelisted in
 * src/proxy.ts. `verifyWebhook` validates the Svix signature against
 * CLERK_WEBHOOK_SIGNING_SECRET and throws on failure.
 */
export async function POST(req: NextRequest) {
  let evt;
  try {
    evt = await verifyWebhook(req);
  } catch (err) {
    console.error("Clerk webhook verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  if (evt.type === "user.created") {
    const data = evt.data;

    // Idempotency: Clerk retries deliveries, so bail if this user already exists.
    const existing = await db.query.users.findFirst({
      where: eq(users.clerkId, data.id),
    });
    if (existing) {
      return new Response("Already provisioned", { status: 200 });
    }

    const primaryEmail =
      data.email_addresses.find((e) => e.id === data.primary_email_address_id)
        ?.email_address ??
      data.email_addresses[0]?.email_address ??
      "";
    const fullName =
      [data.first_name, data.last_name].filter(Boolean).join(" ").trim() ||
      primaryEmail ||
      "New User";
    const orgName = data.first_name ? `${data.first_name}'s Business` : "My Business";

    // neon-http has no interactive transactions; db.batch() runs both inserts
    // atomically. Pre-generate the org id so the user insert can reference it.
    const orgId = crypto.randomUUID();
    await db.batch([
      db.insert(organisations).values({ id: orgId, name: orgName }),
      db.insert(users).values({
        orgId,
        clerkId: data.id,
        name: fullName,
        email: primaryEmail,
        role: "owner",
      }),
    ]);

    return new Response("Provisioned", { status: 201 });
  }

  if (evt.type === "user.deleted") {
    if (evt.data.id) {
      await db.delete(users).where(eq(users.clerkId, evt.data.id));
    }
    return new Response("Deleted", { status: 200 });
  }

  // Unhandled event types are acknowledged so Clerk stops retrying them.
  return new Response("Ignored", { status: 200 });
}
