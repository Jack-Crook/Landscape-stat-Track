import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { provisionUser } from "@/lib/provision";

/**
 * Clerk webhook endpoint. Provisions an organisation + owner user when a Clerk
 * account is created, and removes the user row when the account is deleted.
 * (Users are also provisioned lazily on first request — see src/lib/auth.ts —
 * so this webhook is an optimisation, not a requirement.)
 *
 * Unauthenticated (Clerk signs the request) and whitelisted in src/proxy.ts.
 * `verifyWebhook` validates the Svix signature against CLERK_WEBHOOK_SIGNING_SECRET.
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
    const email =
      data.email_addresses.find((e) => e.id === data.primary_email_address_id)?.email_address ??
      data.email_addresses[0]?.email_address ??
      "";
    const name = [data.first_name, data.last_name].filter(Boolean).join(" ").trim() || email || "New User";

    await provisionUser({
      clerkId: data.id,
      name,
      email,
      orgName: data.first_name ? `${data.first_name}'s Business` : "My Business",
    });
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
