import { asc, eq } from "drizzle-orm";
import { X } from "lucide-react";
import { db } from "@/db";
import { jobCategories } from "@/db/schema";
import { getOrg } from "@/lib/auth";
import { isDevAuth, scannerMode } from "@/lib/env";
import { RECEIPT_MODEL } from "@/lib/receipts/extract";
import { Page, PageHeader, Section } from "@/components/kit/ui";
import { SubmitButton } from "@/components/kit/client";
import { SettingsForm } from "./settings-form";
import { addCategory, deleteCategory } from "./actions";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const org = await getOrg();
  const cats = await db.select().from(jobCategories).where(eq(jobCategories.orgId, org.id)).orderBy(asc(jobCategories.name));
  const scanner = scannerMode();
  return (
    <Page>
      <PageHeader title="Settings" />
      <SettingsForm org={org} />

      <Section title="Job categories" className="mt-8" footer="Used to compare margins and win rates across kinds of work.">
        <ul className="mb-4 flex flex-wrap gap-2">
          {cats.map((c) => (
            <li key={c.id}>
              <form action={deleteCategory} className="inline-flex items-center gap-1 rounded-full bg-fill py-1 pl-3 pr-1 text-[14px] font-medium">
                {c.name}
                <input type="hidden" name="id" value={c.id} />
                <button type="submit" aria-label={`Remove ${c.name}`} className="pressable rounded-full p-1 text-label-2 hover:bg-fill-2">
                  <X className="h-3.5 w-3.5" />
                </button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addCategory} className="flex gap-2">
          <input name="name" className="field" placeholder="Add a category" aria-label="New category" />
          <SubmitButton variant="gray">Add</SubmitButton>
        </form>
      </Section>

      <Section title="Receipt scanning">
        <p>
          {scanner === "claude" && (
            <>
              On. Receipts are read by Claude (<code className="footnote rounded bg-fill px-1">{RECEIPT_MODEL}</code>). Each scan costs a few cents in API usage.
            </>
          )}
          {scanner === "mock" && "Demo mode: scans return sample data (RECEIPT_SCANNER=mock)."}
          {scanner === "off" && "Off. Add ANTHROPIC_API_KEY to the server environment to read receipts automatically."}
        </p>
      </Section>

      {isDevAuth() && (
        <Section title="Demo mode">
          <p className="text-label-2">Running without sign-in (AUTH_MODE=dev). Remove it and set the Clerk keys before putting this online.</p>
        </Section>
      )}
    </Page>
  );
}
