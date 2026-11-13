import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobCategories, organisations, users } from "@/db/schema";
import { DEFAULT_JOB_CATEGORIES } from "./constants";

export type ProvisionInput = {
  clerkId: string;
  name: string;
  email: string;
  orgName: string;
};

/**
 * Creates an organisation + owner user for a new sign-in. Idempotent: returns
 * the existing user if the Clerk id is already provisioned, and survives the
 * race where two requests provision the same user at once (unique clerk_id).
 *
 * Called from the Clerk webhook and, as a fallback, lazily on first request —
 * so a missed or late webhook no longer leaves a signed-in user stranded.
 */
export async function provisionUser(input: ProvisionInput) {
  const existing = await db.query.users.findFirst({ where: eq(users.clerkId, input.clerkId) });
  if (existing) return existing;

  try {
    return await db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organisations)
        .values({ name: input.orgName, ownerName: input.name, email: input.email || null })
        .returning();
      const [user] = await tx
        .insert(users)
        .values({ orgId: org.id, clerkId: input.clerkId, name: input.name, email: input.email, role: "owner" })
        .returning();
      await tx
        .insert(jobCategories)
        .values(DEFAULT_JOB_CATEGORIES.map((name) => ({ orgId: org.id, name })));
      return user;
    });
  } catch (err) {
    // Lost a race to a concurrent provision — the other one's row is the answer.
    const winner = await db.query.users.findFirst({ where: eq(users.clerkId, input.clerkId) });
    if (winner) return winner;
    throw err;
  }
}
