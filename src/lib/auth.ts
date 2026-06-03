import "server-only";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * Resolves the signed-in Clerk user to their app `users` row (which carries the
 * `orgId` used to scope every multi-tenant query). The row is provisioned by the
 * Clerk `user.created` webhook (src/app/api/webhooks/clerk/route.ts), so a freshly
 * authed request can briefly precede the row existing — callers must handle `null`.
 */
export async function getCurrentUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });
  if (!user) return null;

  return { user, orgId: user.orgId };
}

/**
 * Like {@link getCurrentUser} but throws when there is no authed user or no
 * provisioned org. Use in server actions / server components that must be scoped
 * to an organisation; returns the `orgId` to filter queries by.
 */
export async function requireOrg() {
  const current = await getCurrentUser();
  if (!current) {
    throw new Error("Unauthorized: no provisioned user/organisation for the current session");
  }
  return { userId: current.user.id, orgId: current.orgId, user: current.user };
}
