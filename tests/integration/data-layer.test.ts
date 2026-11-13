/**
 * Data layer against a real Postgres (the podman one by default):
 *   INTEGRATION_DATABASE_URL=postgres://postgres:postgres@localhost:5433/landscape_it
 * Skipped automatically if the database can't be reached.
 */
import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

const URL = process.env.INTEGRATION_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/landscape_it";
process.env.DATABASE_URL = URL;

let reachable = true;
try {
  const admin = new Pool({ connectionString: URL.replace(/\/[^/]+$/, "/postgres") });
  const name = URL.split("/").pop()!;
  const { rowCount } = await admin.query("select 1 from pg_database where datname = $1", [name]);
  if (!rowCount) await admin.query(`create database "${name}"`);
  await admin.end();
} catch {
  reachable = false;
}

describe.skipIf(!reachable)("data layer (Postgres)", async () => {
  // Imported lazily so DATABASE_URL is set first.
  const { db } = await import("@/db");
  const schema = await import("@/db/schema");
  const { provisionUser } = await import("@/lib/provision");
  const { loadLedger } = await import("@/lib/data/ledger");
  const { expenseBreakdown } = await import("@/lib/data/expenses");
  const { recomputeJobTotals } = await import("@/lib/data/jobs");
  const { createInvoice } = await import("@/lib/data/invoices");
  const { writeItems, findDuplicate } = await import("@/lib/data/receipts");
  const { topItems, spendingByCategory, itemPurchases } = await import("@/lib/data/spending");
  const { summarisePeriod } = await import("@/lib/finance");
  const { normalizeExtraction } = await import("@/lib/receipts/normalize");
  const { mockExtraction } = await import("@/lib/receipts/mock");
  const { ownsClient, ownsJob, ownsFile } = await import("@/lib/data/ownership");
  const { eq } = await import("drizzle-orm");

  let orgId = "";
  const range = { start: new Date(2026, 9, 1), end: new Date(2027, 0, 1) };
  const inRange = new Date(2026, 10, 10, 12);

  beforeAll(async () => {
    execSync("npx drizzle-kit push --force", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
    const pool = new Pool({ connectionString: URL });
    const { rows } = await pool.query<{ tablename: string }>("select tablename from pg_tables where schemaname='public'");
    if (rows.length) await pool.query(`truncate ${rows.map((r) => `"${r.tablename}"`).join(",")} cascade`);
    await pool.end();
  }, 60_000);

  afterAll(async () => {
    const g = globalThis as unknown as { __landscapePool?: Pool };
    await g.__landscapePool?.end();
  });

  it("provisions a user once, even when requests race", async () => {
    const input = { clerkId: "it-user", name: "IT", email: "it@example.com", orgName: "IT Org" };
    const users = await Promise.all(Array.from({ length: 6 }, () => provisionUser(input)));
    expect(new Set(users.map((u) => u.id)).size).toBe(1);
    orgId = users[0].orgId;
    const orgs = await db.select().from(schema.organisations);
    expect(orgs).toHaveLength(1);
    const cats = await db.select().from(schema.jobCategories).where(eq(schema.jobCategories.orgId, orgId));
    expect(cats.length).toBeGreaterThan(5);
  });

  it("numbers invoices uniquely under concurrency", async () => {
    const org = (await db.query.organisations.findFirst({ where: eq(schema.organisations.id, orgId) }))!;
    const rows = await Promise.all(
      Array.from({ length: 8 }, () =>
        db.transaction((tx) => createInvoice(tx, org, { lineItems: [{ description: "x", quantity: 1, unitPrice: 100 }], status: "draft" }))
      )
    );
    const numbers = rows.map((r) => r.number).sort();
    expect(new Set(numbers).size).toBe(8);
    expect(numbers[0]).toBe("INV-0001");
    expect(numbers[7]).toBe("INV-0008");
    expect(rows[0].total).toBe("110.00");
    await db.delete(schema.invoices).where(eq(schema.invoices.orgId, orgId));
  });

  it("stores scanned items so they sum to the receipt and group by name", async () => {
    const draft = normalizeExtraction(mockExtraction("bunnings.jpg"));
    const [r] = await db
      .insert(schema.receipts)
      .values({ orgId, vendor: draft.vendor, date: inRange, total: "186.60", gstAmount: "16.33", status: "confirmed" })
      .returning();
    await db.transaction((tx) => writeItems(tx, orgId, r.id, draft.items, draft.gstCents));
    const items = await db.select().from(schema.receiptItems).where(eq(schema.receiptItems.receiptId, r.id));
    expect(items).toHaveLength(5);
    expect(items.reduce((s, i) => s + Math.round(Number(i.total) * 100), 0)).toBe(18660);
    expect(items.reduce((s, i) => s + Math.round(Number(i.gstAmount) * 100), 0)).toBe(1633);

    const shovels = await topItems(orgId, { q: "shov" });
    expect(shovels).toHaveLength(1);
    expect(shovels[0].total).toBe("77.96");
    expect(shovels[0].quantity).toBe("2.000");
    // LIKE wildcards in the search are literal.
    expect(await topItems(orgId, { q: "%" })).toHaveLength(0);
    expect((await itemPurchases(orgId, "shovel"))[0].vendor).toBe("Bunnings Warehouse");
    const cats = await spendingByCategory(orgId, range);
    expect(cats.find((c) => c.category === "food")?.total).toBe("7.00");

    expect(await findDuplicate(orgId, { date: inRange, total: "186.60", vendor: "Bunnings" })).not.toBeNull();
    expect(await findDuplicate(orgId, { id: r.id, date: inRange, total: "186.60", vendor: "Bunnings" })).toBeNull();
    expect(await findDuplicate(orgId, { date: inRange, total: "186.61", vendor: "Bunnings" })).toBeNull();
  });

  it("job totals include confirmed receipts, costs and mileage", async () => {
    const [job] = await db.insert(schema.jobs).values({ orgId, name: "IT job", quotedPrice: "1100.00" }).returning();
    await db.insert(schema.costLines).values({ jobId: job.id, type: "materials", amount: "220.00", gstAmount: "20.00", createdAt: inRange });
    await db.insert(schema.mileageLogs).values({ jobId: job.id, km: "10", total: "8.80", createdAt: inRange });
    await db.insert(schema.receipts).values([
      { orgId, jobId: job.id, vendor: "A", date: inRange, total: "55.00", gstAmount: "5.00", status: "confirmed" },
      { orgId, jobId: job.id, vendor: "B", date: inRange, total: "999.00", gstAmount: "90.00", status: "needs_review" },
    ]);
    await recomputeJobTotals(job.id);
    const after = (await db.query.jobs.findFirst({ where: eq(schema.jobs.id, job.id) }))!;
    expect(after.actualCost).toBe("258.80"); // 200 + 8.80 + 50
    expect(after.profit).toBe("741.20"); // 1000 − 258.80
  });

  it("the P&L statement lines add up to the summary figures", async () => {
    // A receipt whose items don't cover its total exercises the balancing line.
    const [r] = await db
      .insert(schema.receipts)
      .values({ orgId, vendor: "Partial", date: inRange, total: "50.00", gstAmount: "4.55", status: "confirmed", category: "materials" })
      .returning();
    await db.insert(schema.receiptItems).values({ orgId, receiptId: r.id, description: "Pipe", itemName: "Pipe", category: "irrigation", total: "30.00", gstAmount: "2.73" });
    await db.insert(schema.receipts).values({ orgId, vendor: "Cafe", date: inRange, total: "22.00", gstAmount: "2.00", status: "confirmed", category: "food" });

    for (const gstRegistered of [true, false]) {
      const ledger = await loadLedger(orgId);
      const s = summarisePeriod({ ...ledger, range, basis: "cash", gstRegistered });
      const b = await expenseBreakdown(orgId, range, gstRegistered, ledger);
      expect(b.deductible).toBe(s.expenses);
      expect(b.nonDeductible).toBe(s.nonDeductible);
      expect(b.lines.some((l) => l.key === "unitemised")).toBe(true);
    }
  });

  it("refuses ids that belong to another business", async () => {
    const other = await provisionUser({ clerkId: "it-other", name: "Other", email: "o@example.com", orgName: "Other Org" });
    const [theirClient] = await db.insert(schema.clients).values({ orgId: other.orgId, name: "Their client" }).returning();
    const [theirJob] = await db.insert(schema.jobs).values({ orgId: other.orgId, name: "Their job" }).returning();
    const [theirFile] = await db
      .insert(schema.files)
      .values({ orgId: other.orgId, mimeType: "image/png", size: 1, data: Buffer.from([0]) })
      .returning({ id: schema.files.id });
    expect(await ownsClient(orgId, theirClient.id)).toBe(false);
    expect(await ownsJob(orgId, theirJob.id)).toBe(false);
    expect(await ownsFile(orgId, theirFile.id)).toBe(false);
    expect(await ownsClient(other.orgId, theirClient.id)).toBe(true);
    expect(await ownsClient(orgId, null)).toBe(true);
    // The other org's data never shows up in this org's reports.
    const ledger = await loadLedger(orgId);
    expect(ledger.receipts.every((r) => r.vendor !== "Their client")).toBe(true);
    expect((await topItems(other.orgId)).length).toBe(0);
  });
});
