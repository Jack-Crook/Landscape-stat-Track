import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organisations, users } from "@/db/schema";
import { isDevAuth } from "./env";
import { provisionUser } from "./provision";

export const DEV_CLERK_ID = "dev-user";

async function resolveUser() {
  // Everything behind sign-in is per-request data: never prerender it at build
  // time (dev auth reads no headers, so Next would otherwise make pages static).
  await connection();
  if (isDevAuth()) {
    return provisionUser({
      clerkId: DEV_CLERK_ID,
      name: "Demo User",
      email: "demo@example.com",
      orgName: "Demo Landscaping",
    });
  }

  const { auth, currentUser } = await import("@clerk/nextjs/server");
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const user = await db.query.users.findFirst({ where: eq(users.clerkId, clerkId) });
  if (user) return user;

  // The webhook hasn't provisioned this user (not registered yet, or slower than
  // the redirect). Provision from the Clerk profile instead of failing.
  const profile = await currentUser();
  if (!profile) return null;
  const email = profile.primaryEmailAddress?.emailAddress ?? profile.emailAddresses[0]?.emailAddress ?? "";
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() || email || "New User";
  return provisionUser({
    clerkId,
    name,
    email,
    orgName: profile.firstName ? `${profile.firstName}'s Business` : "My Business",
  });
}

/**
 * Resolves the signed-in user to their app `users` row, which carries the
 * `orgId` that scopes every multi-tenant query. Memoised per request.
 */
export const getCurrentUser = cache(async () => {
  const user = await resolveUser();
  if (!user) return null;
  return { user, orgId: user.orgId };
});

/**
 * Like {@link getCurrentUser} but throws when there is no authed user. Use in
 * server actions / components that must be scoped to an organisation.
 */
export async function requireOrg() {
  const current = await getCurrentUser();
  if (!current) {
    throw new Error("Unauthorized: no signed-in user");
  }
  return { userId: current.user.id, orgId: current.orgId, user: current.user };
}

/** The current org's settings row. */
export const getOrg = cache(async () => {
  const { orgId } = await requireOrg();
  const org = await db.query.organisations.findFirst({ where: eq(organisations.id, orgId) });
  if (!org) throw new Error("Organisation not found");
  return org;
});
