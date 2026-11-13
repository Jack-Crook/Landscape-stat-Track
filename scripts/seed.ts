/**
 * Fills the database with ~15 months of realistic demo data for the dev user
 * (AUTH_MODE=dev) or a given Clerk user.
 *
 *   npm run db:seed                 # demo org for AUTH_MODE=dev
 *   npm run db:seed -- --reset      # wipe that org's data first
 *   SEED_CLERK_ID=user_abc npm run db:seed   # seed a real (Clerk) user's org
 *
 * Deterministic (seeded random), so screenshots and tests are repeatable.
 */
import { config } from "dotenv";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";

config({ path: ".env.local" });
const {
  organisations, users, clients, jobs, quotes, invoices, receipts, receiptItems, costLines, mileageLogs, jobCategories,
} = schema;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const money = (n: number) => n.toFixed(2);
const gstOf = (inc: number) => Math.round((inc / 11) * 100) / 100;
const day = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);

const CLERK_ID = process.env.SEED_CLERK_ID ?? "dev-user";

const CATS = ["Lawn mowing", "Garden maintenance", "Landscape construction", "Paving", "Retaining walls", "Turf laying", "Irrigation", "Hedging & pruning", "Planting", "Green waste removal"];

const CLIENTS = [
  ["Sarah Mitchell", "14 Banksia Ct, Mudgeeraba QLD 4213", "0412 555 101"],
  ["Tom & Priya Nguyen", "3 Ironbark St, Robina QLD 4226", "0423 555 202"],
  ["Coastal Body Corporate", "88 Esplanade, Burleigh Heads QLD 4220", "07 5555 0303"],
  ["Greg Harris", "27 Wattle Rd, Nerang QLD 4211", "0434 555 404"],
  ["Mel O'Brien", "5 Grevillea Pl, Varsity Lakes QLD 4227", "0445 555 505"],
  ["Hinterland Cafe", "120 Main St, Tamborine Mountain QLD 4272", "07 5555 0606"],
  ["David Chen", "41 Lilly Pilly Dr, Carrara QLD 4211", "0456 555 707"],
  ["Riverside Childcare", "9 Creek Rd, Oxenford QLD 4210", "07 5555 0808"],
] as const;

// Items bought over time; base price drifts up ~6%/yr. [name, desc, category, unit, base price, supplier]
const ITEMS = [
  ["Shovel", "CYCLONE SHOVEL RND MOUTH FG", "tools", "each", 39.98, "Bunnings Warehouse"],
  ["Garden mulch", "SCOTTS OSMOCOTE MULCH 50L", "materials", "bag", 12.5, "Bunnings Warehouse"],
  ["Garden mulch", "PINE BARK MULCH BULK m3", "materials", "m3", 68, "Gold Coast Landscape Supplies"],
  ["Turf", "SIR WALTER BUFFALO m2", "plants", "m2", 13.5, "Gold Coast Turf Farm"],
  ["Garden soil", "PREMIUM GARDEN MIX m3", "materials", "m3", 89, "Gold Coast Landscape Supplies"],
  ["Trimmer line", "TRIMMER LINE 2.4MM 15M", "machinery", "each", 6.66, "Bunnings Warehouse"],
  ["Work gloves", "PRO CHOICE NITRILE GLOVES L", "safety", "pack", 19.98, "Bunnings Warehouse"],
  ["Fertiliser", "LAWN SOLUTIONS PREMIUM 4KG", "chemicals", "bag", 34.95, "Bunnings Warehouse"],
  ["Herbicide", "ROUNDUP BIACTIVE 1L", "chemicals", "each", 42.0, "Bunnings Warehouse"],
  ["Pavers", "SANDSTONE PAVER 400X400", "materials", "each", 7.9, "Pavers Plus"],
  ["Sleeper", "TREATED PINE SLEEPER 200X50 2.4M", "materials", "each", 24.5, "Bunnings Warehouse"],
  ["Drip line", "POLY DRIP LINE 13MM 50M", "irrigation", "roll", 64, "Reece Irrigation"],
  ["Mower blade", "VICTA MOWER BLADE SET", "machinery", "set", 29.95, "Mower World"],
  ["Plant", "LILLY PILLY 200MM POT", "plants", "each", 24.95, "Nerang Nursery"],
  ["Rake", "SARAN STEEL RAKE 14T", "tools", "each", 27.5, "Bunnings Warehouse"],
  ["Wheelbarrow", "TRUPER WHEELBARROW 100L", "tools", "each", 129, "Bunnings Warehouse"],
] as const;

// Most suppliers print an ABN; a couple don't, so the "GST credits at risk" check has something to show.
const SUPPLIER_ABN: Record<string, string> = {
  "Bunnings Warehouse": "26008672179",
  "Gold Coast Landscape Supplies": "51824753556",
  "Gold Coast Turf Farm": "40004201307",
  "Reece Irrigation": "26008672179",
  "Mower World": "51824753556",
};

async function main() {
  const reset = process.argv.includes("--reset");
  let user = await db.query.users.findFirst({ where: eq(users.clerkId, CLERK_ID) });
  if (!user) {
    const [org] = await db.insert(organisations).values({ name: "Demo Landscaping", ownerName: "Demo User" }).returning();
    [user] = await db.insert(users).values({ orgId: org.id, clerkId: CLERK_ID, name: "Demo User", email: "demo@example.com" }).returning();
  }
  const orgId = user.orgId;

  if (reset) {
    for (const t of [receipts, invoices, quotes, jobs, clients, jobCategories]) await db.delete(t).where(eq(t.orgId, orgId));
    await db.delete(schema.files).where(eq(schema.files.orgId, orgId));
  } else {
    const existing = await db.query.jobs.findFirst({ where: eq(jobs.orgId, orgId) });
    if (existing) {
      console.log("Org already has data. Re-run with --reset to replace it.");
      await pool.end();
      return;
    }
  }

  await db
    .update(organisations)
    .set({
      name: "Green Edge Landscaping",
      ownerName: "Jake Thompson",
      abn: "51824753556",
      email: "jake@greenedge.example",
      phone: "0400 555 999",
      address: "Unit 4, 12 Industrial Ave, Molendinar QLD 4214",
      gstRegistered: true,
      bankAccountName: "Green Edge Landscaping",
      bankBsb: "064-000",
      bankAccountNumber: "12345678",
      invoiceNotes: "Thanks for your business! Payment within 14 days please.",
      nextInvoiceNumber: 1,
      nextQuoteNumber: 1,
    })
    .where(eq(organisations.id, orgId));
  await db.insert(jobCategories).values(CATS.map((name) => ({ orgId, name })));

  const clientRows = await db
    .insert(clients)
    .values(CLIENTS.map(([name, address, phone], i) => ({ orgId, name, address, phone, email: `${name.split(" ")[0].toLowerCase().replace(/\W/g, "")}@example.com`, isPreferred: i < 2 })))
    .returning();

  const now = new Date();
  const start = new Date(now.getFullYear() - 1, now.getMonth() - 3, 1);
  let invNo = 1;
  let quoteNo = 1;

  // ~10 jobs a month, busier in spring/summer.
  for (let d = new Date(start); d < now; d = day(d, 1)) {
    const m = d.getMonth();
    const seasonal = [9, 10, 11, 0, 1, 2].includes(m) ? 0.45 : 0.25;
    if (d.getDay() === 0 || rand() > seasonal) continue;

    const category = pick(CATS);
    const client = pick(clientRows);
    const big = ["Landscape construction", "Paving", "Retaining walls", "Turf laying", "Irrigation"].includes(category);
    const priceEx = Math.round(big ? between(1200, 9000) : between(120, 650));
    const priceInc = priceEx * 1.1;
    const hours = big ? Math.round(between(8, 40)) : Math.round(between(1, 6) * 2) / 2;
    const estimated = Math.round(priceEx * between(0.35, 0.6));
    const age = (now.getTime() - d.getTime()) / 86_400_000;
    const status = age > 30 ? "paid" : age > 14 ? pick(["paid", "paid", "invoiced"] as const) : age > 4 ? pick(["completed", "invoiced", "in_progress"] as const) : pick(["quoted", "in_progress"] as const);

    // Quote first for bigger jobs (some lost).
    if (big) {
      const lines = [
        { description: `${category}: labour`, quantity: hours, unitPrice: 75 },
        { description: `${category}: materials & supply`, quantity: 1, unitPrice: Math.max(0, priceEx - hours * 75) },
      ];
      const sub = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
      const sentAt = day(d, -Math.round(between(5, 20)));
      const lost = rand() < 0.35;
      await db.insert(quotes).values({
        orgId, clientId: pick(clientRows).id, number: `Q-${String(quoteNo++).padStart(4, "0")}`, title: `${category} for ${client.name.split(" ")[0]}`,
        category, estimatedCost: money(estimated), lineItems: JSON.stringify(lines), subtotal: money(sub), gstAmount: money(sub * 0.1), total: money(sub * 1.1),
        status: lost ? pick(["declined", "no_response"] as const) : "accepted", sentAt, respondedAt: day(sentAt, Math.round(between(1, 10))), createdAt: sentAt,
      });
      if (lost) continue;
    }

    const isRecurring = category === "Lawn mowing" && rand() < 0.3;
    const [job] = await db
      .insert(jobs)
      .values({
        orgId, clientId: client.id, name: `${category}: ${client.name.split(" ")[0]}`, category, siteAddress: client.address, status,
        quotedPrice: money(priceInc), estimatedCost: money(estimated), startDate: d, endDate: big ? day(d, Math.round(between(1, 5))) : d,
        completedAt: ["completed", "invoiced", "paid"].includes(status) ? day(d, big ? 3 : 0) : null, hoursWorked: String(hours),
        isRecurring, recurrenceInterval: isRecurring ? "fortnightly" : null, createdAt: day(d, -2),
      })
      .returning();

    // Costs: receipts with items, sometimes a subcontractor, mileage.
    let costEx = 0;
    const trips = Math.ceil(between(1, big ? 6 : 2));
    for (let t = 0; t < trips; t++) {
      const km = Math.round(between(8, 45));
      await db.insert(mileageLogs).values({ jobId: job.id, km: String(km), ratePerKm: "0.8800", total: money(km * 0.88), notes: "Yard → site → yard", createdAt: d });
      costEx += km * 0.88;
    }
    if (big && rand() < 0.4) {
      const amt = Math.round(between(300, 1500));
      await db.insert(costLines).values({ jobId: job.id, type: "labour", description: "Labourer (subcontract)", amount: money(amt), gstAmount: money(gstOf(amt)), createdAt: d });
      costEx += amt - gstOf(amt);
    }
    const receiptCount = big ? Math.ceil(between(1, 4)) : rand() < 0.25 ? 1 : 0;
    for (let r = 0; r < receiptCount; r++) {
      const rd = new Date(Math.min(day(d, Math.round(between(-2, 2))).getTime(), now.getTime()));
      costEx += await addReceipt(orgId, rd, job.id, big ? 4 : 2);
    }

    if (["invoiced", "paid"].includes(status)) {
      const issue = day(d, big ? 4 : 1);
      const paid = status === "paid";
      const lines = [{ description: job.name, quantity: 1, unitPrice: priceEx }];
      await db.insert(invoices).values({
        orgId, jobId: job.id, clientId: client.id, number: `INV-${String(invNo++).padStart(4, "0")}`, status: paid ? "paid" : "sent", issueDate: issue,
        dueDate: day(issue, 14), lineItems: lines, subtotal: money(priceEx), gstAmount: money(priceEx * 0.1), total: money(priceInc),
        amountPaid: paid ? money(priceInc) : "0", paidAt: paid ? day(issue, Math.round(between(2, client.name.includes("Body") ? 45 : 18))) : null, sentAt: issue,
      });
    }
    const profit = priceEx - costEx;
    await db.update(jobs).set({ actualCost: money(costEx), profit: money(profit) }).where(eq(jobs.id, job.id));
  }

  // A few booked jobs in the next fortnight.
  for (let i = 1; i <= 5; i++) {
    const c = pick(clientRows);
    const category = pick(CATS);
    await db.insert(jobs).values({
      orgId, clientId: c.id, name: `${category}: ${c.name.split(" ")[0]}`, category, siteAddress: c.address, status: i < 3 ? "in_progress" : "quoted",
      quotedPrice: money(Math.round(between(150, 2500)) * 1.1), startDate: day(now, i * 2 + 1), hoursWorked: null,
    });
  }

  // General business receipts: fuel weekly, the odd tool, phone, insurance.
  for (let d = new Date(start); day(d, 3) < now; d = day(d, 7)) {
    const litres = between(40, 70);
    const price = 1.85 + (d.getTime() - start.getTime()) / (365 * 86_400_000) * 0.12 + between(-0.1, 0.1);
    const total = Math.round(litres * price * 100) / 100;
    const [r] = await db
      .insert(receipts)
      .values({ orgId, vendor: pick(["Ampol", "BP", "Shell"]), date: day(d, 1), total: money(total), gstAmount: money(gstOf(total)), subtotal: money(total - gstOf(total)), category: "fuel", status: "confirmed", vendorAbn: "40004201307", paymentMethod: "card", isTaxInvoice: true })
      .returning();
    await db.insert(receiptItems).values({ orgId, receiptId: r.id, description: "U91 UNLEADED", itemName: "Unleaded petrol", category: "fuel", quantity: litres.toFixed(2), unit: "L", unitPrice: price.toFixed(4), total: money(total), gstAmount: money(gstOf(total)) });
    if (rand() < 0.2) await addReceipt(orgId, day(d, 3), null, 3);
  }
  // A capital purchase and a couple waiting for review.
  const [mower] = await db
    .insert(receipts)
    .values({ orgId, vendor: "Mower World", date: day(now, -60), total: "2499.00", gstAmount: "227.18", subtotal: "2271.82", category: "machinery", isCapital: true, status: "confirmed", vendorAbn: "26008672179" })
    .returning();
  await db.insert(receiptItems).values({ orgId, receiptId: mower.id, description: "HONDA HRU196 BUFFALO PRO MOWER", itemName: "Lawn mower", brand: "Honda", category: "machinery", quantity: "1", unit: "each", unitPrice: "2499.0000", total: "2499.00", gstAmount: "227.18" });

  await db.update(organisations).set({ nextInvoiceNumber: invNo, nextQuoteNumber: quoteNo }).where(eq(organisations.id, orgId));
  const counts = await Promise.all([jobs, invoices, receipts, receiptItems, quotes].map((t) => db.$count(t, eq(t.orgId, orgId))));
  console.log(`Seeded: ${counts[0]} jobs, ${counts[1]} invoices, ${counts[2]} receipts (${counts[3]} items), ${counts[4]} quotes.`);
  await pool.end();
}

/** One supplier receipt with 1–n items. Returns its ex-GST total. */
async function addReceipt(orgId: string, date: Date, jobId: string | null, maxItems: number) {
  const supplier = pick(ITEMS)[5];
  const pool_ = ITEMS.filter((i) => i[5] === supplier);
  const n = Math.max(1, Math.ceil(between(0, Math.min(maxItems, pool_.length))));
  const chosen = [...pool_].sort(() => rand() - 0.5).slice(0, n);
  const years = (date.getTime() - new Date(2025, 0, 1).getTime()) / (365 * 86_400_000);
  const lines = chosen.map(([name, desc, category, unit, base]) => {
    const qty = unit === "m2" ? Math.round(between(20, 120)) : unit === "m3" ? Math.round(between(1, 6)) : unit === "each" && base < 15 ? Math.round(between(4, 40)) : Math.ceil(between(1, 4));
    const unitPrice = Math.round(base * (1 + 0.06 * years) * between(0.97, 1.03) * 100) / 100;
    const total = Math.round(qty * unitPrice * 100) / 100;
    return { name, desc, category, unit, qty, unitPrice, total, gst: gstOf(total) };
  });
  const total = Math.round(lines.reduce((s, l) => s + l.total, 0) * 100) / 100;
  const gst = Math.round(lines.reduce((s, l) => s + l.gst, 0) * 100) / 100;
  const [r] = await db
    .insert(receipts)
    .values({
      orgId, jobId, vendor: supplier, date, total: money(total), gstAmount: money(gst), subtotal: money(total - gst), category: lines[0].category,
      status: "confirmed", vendorAbn: SUPPLIER_ABN[supplier] ?? null, paymentMethod: pick(["card", "card", "account"]), isTaxInvoice: true,
    })
    .returning();
  await db.insert(receiptItems).values(
    lines.map((l, position) => ({
      orgId, receiptId: r.id, position, description: l.desc, itemName: l.name, category: l.category, quantity: String(l.qty), unit: l.unit,
      unitPrice: l.unitPrice.toFixed(4), total: money(l.total), gstAmount: money(l.gst),
    }))
  );
  return total - gst;
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
