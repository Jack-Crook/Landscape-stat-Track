import { and, count, eq } from "drizzle-orm";
import { UserButton } from "@clerk/nextjs";
import { db } from "@/db";
import { receipts } from "@/db/schema";
import { getOrg } from "@/lib/auth";
import { clerkEnabled, isDevAuth } from "@/lib/env";
import { Sidebar, TabBar } from "@/components/layout/AppNav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const org = await getOrg();
  const [{ value: reviewCount }] = await db
    .select({ value: count() })
    .from(receipts)
    .where(and(eq(receipts.orgId, org.id), eq(receipts.status, "needs_review")));

  return (
    <div className="flex min-h-dvh">
      <Sidebar
        businessName={org.name}
        reviewCount={reviewCount}
        userSlot={clerkEnabled() ? <UserButton /> : isDevAuth() ? <span className="caption rounded-full bg-fill px-2 py-0.5 font-semibold text-label-2">Demo</span> : null}
      />
      <main className="min-w-0 flex-1">{children}</main>
      <TabBar reviewCount={reviewCount} />
    </div>
  );
}
