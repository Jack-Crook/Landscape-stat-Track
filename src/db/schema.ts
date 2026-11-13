import {
  pgTable,
  text,
  timestamp,
  numeric,
  integer,
  boolean,
  pgEnum,
  index,
  uniqueIndex,
  uuid,
  jsonb,
  customType,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Migration rule: this schema is applied with `drizzle-kit push` to a Neon DB that
// already holds data. Only ADD tables/columns (with defaults) — never change an
// existing column's type or drop one, or push will want to destroy data.

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// ─── Enums ────────────────────────────────────────────────────────────────────

export const jobStatusEnum = pgEnum("job_status", [
  "quoted",
  "in_progress",
  "completed",
  "invoiced",
  "paid",
]);

export const quoteStatusEnum = pgEnum("quote_status", [
  "draft",
  "sent",
  "accepted",
  "declined",
  "no_response",
]);

export const costTypeEnum = pgEnum("cost_type", ["materials", "labour", "travel", "other"]);

export const userRoleEnum = pgEnum("user_role", ["owner", "employee"]);

export const recurrenceEnum = pgEnum("recurrence_interval", ["weekly", "fortnightly", "monthly"]);

export const receiptStatusEnum = pgEnum("receipt_status", ["needs_review", "confirmed"]);

export const invoiceStatusEnum = pgEnum("invoice_status", ["draft", "sent", "paid", "void"]);

// ─── Organisation ─────────────────────────────────────────────────────────────
// Top-level tenant. org_id is the multi-tenancy key on every other table.

export const organisations = pgTable("organisations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  abn: text("abn"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("10.00"),
  subscriptionTier: text("subscription_tier").notNull().default("starter"),
  // Business details printed on invoices/quotes
  ownerName: text("owner_name"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  // Tax settings
  gstRegistered: boolean("gst_registered").notNull().default(true),
  /** 'sole_trader' | 'company' — drives the income tax estimate. */
  entityType: text("entity_type").notNull().default("sole_trader"),
  /** 'quarterly' | 'monthly' — BAS reporting cycle. */
  basFrequency: text("bas_frequency").notNull().default("quarterly"),
  /** 'cash' | 'accrual' — when sales count for GST/income. */
  accountingBasis: text("accounting_basis").notNull().default("cash"),
  /** Taxable income from outside the business (sole traders), for the marginal-rate estimate. */
  otherIncome: numeric("other_income", { precision: 12, scale: 2 }).notNull().default("0"),
  mileageRate: numeric("mileage_rate", { precision: 6, scale: 4 }).notNull().default("0.88"),
  defaultHourlyRate: numeric("default_hourly_rate", { precision: 10, scale: 2 }),
  // Invoicing
  invoicePrefix: text("invoice_prefix").notNull().default("INV-"),
  nextInvoiceNumber: integer("next_invoice_number").notNull().default(1),
  quotePrefix: text("quote_prefix").notNull().default("Q-"),
  nextQuoteNumber: integer("next_quote_number").notNull().default(1),
  paymentTermsDays: integer("payment_terms_days").notNull().default(14),
  bankAccountName: text("bank_account_name"),
  bankBsb: text("bank_bsb"),
  bankAccountNumber: text("bank_account_number"),
  invoiceNotes: text("invoice_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    clerkId: text("clerk_id").notNull().unique(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: userRoleEnum("role").notNull().default("owner"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("users_org_idx").on(t.orgId)]
);

// ─── Clients ──────────────────────────────────────────────────────────────────

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address"),
    phone: text("phone"),
    email: text("email"),
    notes: text("notes"),
    isPreferred: boolean("is_preferred").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("clients_org_idx").on(t.orgId)]
);

// ─── Jobs ─────────────────────────────────────────────────────────────────────
// Money convention: `quotedPrice` is what the client pays, GST-inclusive.
// `actualCost` and `profit` are cached, GST-exclusive, recomputed on every cost
// change (see src/lib/data/job-totals.ts).

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    siteAddress: text("site_address"),
    status: jobStatusEnum("status").notNull().default("quoted"),
    quotedPrice: numeric("quoted_price", { precision: 10, scale: 2 }),
    /** What you expected the job to cost (GST-exclusive) — for blowout tracking. */
    estimatedCost: numeric("estimated_cost", { precision: 10, scale: 2 }),
    actualCost: numeric("actual_cost", { precision: 10, scale: 2 }),
    profit: numeric("profit", { precision: 10, scale: 2 }),
    startDate: timestamp("start_date"),
    endDate: timestamp("end_date"),
    completedAt: timestamp("completed_at"),
    isRecurring: boolean("is_recurring").notNull().default(false),
    recurrenceInterval: recurrenceEnum("recurrence_interval"),
    // Links recurring job instance back to its parent
    parentJobId: uuid("parent_job_id"),
    hoursWorked: numeric("hours_worked", { precision: 6, scale: 2 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("jobs_org_idx").on(t.orgId),
    index("jobs_client_idx").on(t.clientId),
    index("jobs_status_idx").on(t.status),
  ]
);

// ─── Cost Lines ───────────────────────────────────────────────────────────────
// Manual costs on a job (labour, materials bought without a receipt, etc).
// `amount` is GST-inclusive; `gstAmount` is the GST component inside it.

export const costLines = pgTable(
  "cost_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    type: costTypeEnum("type").notNull(),
    description: text("description"),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    gstAmount: numeric("gst_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("cost_lines_job_idx").on(t.jobId)]
);

// ─── Mileage ──────────────────────────────────────────────────────────────────

export const mileageLogs = pgTable(
  "mileage_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    km: numeric("km", { precision: 8, scale: 2 }).notNull(),
    ratePerKm: numeric("rate_per_km", { precision: 6, scale: 4 }).notNull().default("0.88"),
    total: numeric("total", { precision: 10, scale: 2 }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("mileage_job_idx").on(t.jobId)]
);

// ─── Quotes ───────────────────────────────────────────────────────────────────
// Quote line items are GST-exclusive; GST is added on top (when registered).

export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    // Set when quote is converted to a job
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    number: text("number"),
    title: text("title").notNull(),
    category: text("category"),
    /** Your expected costs for the work (GST-exclusive), copied to the job on convert. */
    estimatedCost: numeric("estimated_cost", { precision: 10, scale: 2 }),
    lineItems: text("line_items").notNull().default("[]"), // JSON array stored as text
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
    gstAmount: numeric("gst_amount", { precision: 10, scale: 2 }).notNull(),
    total: numeric("total", { precision: 10, scale: 2 }).notNull(),
    status: quoteStatusEnum("status").notNull().default("draft"),
    notes: text("notes"),
    sentAt: timestamp("sent_at"),
    respondedAt: timestamp("responded_at"),
    validUntil: timestamp("valid_until"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("quotes_org_idx").on(t.orgId),
    index("quotes_client_idx").on(t.clientId),
    index("quotes_status_idx").on(t.status),
  ]
);

// ─── Invoices ─────────────────────────────────────────────────────────────────
// Revenue source of truth. Cash basis: income counts on `paidAt`; accrual: on
// `issueDate`. Line items are GST-exclusive, like quotes.

export type InvoiceLineItem = { description: string; quantity: number; unitPrice: number };

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    number: text("number").notNull(),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    issueDate: timestamp("issue_date").notNull().defaultNow(),
    dueDate: timestamp("due_date"),
    lineItems: jsonb("line_items").$type<InvoiceLineItem[]>().notNull().default([]),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
    gstAmount: numeric("gst_amount", { precision: 12, scale: 2 }).notNull(),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }).notNull().default("0"),
    paidAt: timestamp("paid_at"),
    sentAt: timestamp("sent_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("invoices_org_idx").on(t.orgId),
    index("invoices_job_idx").on(t.jobId),
    index("invoices_client_idx").on(t.clientId),
    uniqueIndex("invoices_org_number_uq").on(t.orgId, t.number),
  ]
);

// ─── Files ────────────────────────────────────────────────────────────────────
// Receipt images/PDFs and job photos. Stored in Postgres so the app needs no
// extra cloud bucket; images are downscaled in the browser before upload.

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    filename: text("filename"),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("files_org_idx").on(t.orgId)]
);

// ─── Receipts ─────────────────────────────────────────────────────────────────
// `total` is what was paid (GST-inclusive); `gstAmount` is the GST credit.

export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    // Nullable: general business expense if not linked to a job
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    status: receiptStatusEnum("status").notNull().default("confirmed"),
    vendor: text("vendor").notNull(),
    vendorBranch: text("vendor_branch"),
    vendorAbn: text("vendor_abn"),
    vendorAddress: text("vendor_address"),
    vendorPhone: text("vendor_phone"),
    receiptNumber: text("receipt_number"),
    date: timestamp("date").notNull(),
    time: text("time"),
    paymentMethod: text("payment_method"),
    cardLast4: text("card_last4"),
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }),
    discountTotal: numeric("discount_total", { precision: 10, scale: 2 }),
    gstAmount: numeric("gst_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 10, scale: 2 }).notNull(),
    isTaxInvoice: boolean("is_tax_invoice"),
    /** Equipment/vehicles kept for years (BAS G10) rather than everyday purchases (G11). */
    isCapital: boolean("is_capital").notNull().default(false),
    category: text("category"),
    notes: text("notes"),
    imageUrl: text("image_url"),
    fileId: uuid("file_id").references(() => files.id, { onDelete: "set null" }),
    rawOcrData: text("raw_ocr_data"), // JSON string from Claude Vision
    scanConfidence: text("scan_confidence"),
    scanWarnings: jsonb("scan_warnings").$type<string[]>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("receipts_org_idx").on(t.orgId),
    index("receipts_job_idx").on(t.jobId),
    index("receipts_date_idx").on(t.date),
    index("receipts_status_idx").on(t.status),
  ]
);

// ─── Receipt items ────────────────────────────────────────────────────────────
// Every line on a receipt. `itemName` is a normalised generic name ("Shovel",
// "Unleaded petrol") so spending can be grouped across suppliers and wordings.
// `total` is the GST-inclusive line total after line discounts.

export const receiptItems = pgTable(
  "receipt_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => receipts.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    description: text("description").notNull(),
    itemName: text("item_name").notNull(),
    brand: text("brand"),
    sku: text("sku"),
    category: text("category").notNull().default("other"),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull().default("1"),
    unit: text("unit"),
    unitPrice: numeric("unit_price", { precision: 12, scale: 4 }),
    discount: numeric("discount", { precision: 10, scale: 2 }),
    total: numeric("total", { precision: 10, scale: 2 }).notNull(),
    gstAmount: numeric("gst_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    gstFree: boolean("gst_free").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("receipt_items_org_idx").on(t.orgId),
    index("receipt_items_receipt_idx").on(t.receiptId),
    index("receipt_items_name_idx").on(t.orgId, t.itemName),
    index("receipt_items_category_idx").on(t.orgId, t.category),
  ]
);

// ─── Job Photos ───────────────────────────────────────────────────────────────

export const jobPhotos = pgTable(
  "job_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    imageUrl: text("image_url").notNull(),
    fileId: uuid("file_id").references(() => files.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("progress"), // 'before' | 'after' | 'progress'
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("job_photos_job_idx").on(t.jobId)]
);

// ─── Job Categories ───────────────────────────────────────────────────────────
// Configurable per org — not hardcoded, so this works for any trade business.

export const jobCategories = pgTable(
  "job_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("job_categories_org_idx").on(t.orgId)]
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const organisationsRelations = relations(organisations, ({ many }) => ({
  users: many(users),
  clients: many(clients),
  jobs: many(jobs),
  quotes: many(quotes),
  invoices: many(invoices),
  receipts: many(receipts),
  jobCategories: many(jobCategories),
}));

export const usersRelations = relations(users, ({ one }) => ({
  organisation: one(organisations, { fields: [users.orgId], references: [organisations.id] }),
}));

export const clientsRelations = relations(clients, ({ one, many }) => ({
  organisation: one(organisations, { fields: [clients.orgId], references: [organisations.id] }),
  jobs: many(jobs),
  quotes: many(quotes),
  invoices: many(invoices),
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  organisation: one(organisations, { fields: [jobs.orgId], references: [organisations.id] }),
  client: one(clients, { fields: [jobs.clientId], references: [clients.id] }),
  costLines: many(costLines),
  mileageLogs: many(mileageLogs),
  photos: many(jobPhotos),
  receipts: many(receipts),
  quotes: many(quotes),
  invoices: many(invoices),
}));

export const costLinesRelations = relations(costLines, ({ one }) => ({
  job: one(jobs, { fields: [costLines.jobId], references: [jobs.id] }),
}));

export const mileageLogsRelations = relations(mileageLogs, ({ one }) => ({
  job: one(jobs, { fields: [mileageLogs.jobId], references: [jobs.id] }),
}));

export const quotesRelations = relations(quotes, ({ one }) => ({
  organisation: one(organisations, { fields: [quotes.orgId], references: [organisations.id] }),
  client: one(clients, { fields: [quotes.clientId], references: [clients.id] }),
  job: one(jobs, { fields: [quotes.jobId], references: [jobs.id] }),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  organisation: one(organisations, { fields: [invoices.orgId], references: [organisations.id] }),
  client: one(clients, { fields: [invoices.clientId], references: [clients.id] }),
  job: one(jobs, { fields: [invoices.jobId], references: [jobs.id] }),
}));

export const receiptsRelations = relations(receipts, ({ one, many }) => ({
  organisation: one(organisations, { fields: [receipts.orgId], references: [organisations.id] }),
  job: one(jobs, { fields: [receipts.jobId], references: [jobs.id] }),
  file: one(files, { fields: [receipts.fileId], references: [files.id] }),
  items: many(receiptItems),
}));

export const receiptItemsRelations = relations(receiptItems, ({ one }) => ({
  receipt: one(receipts, { fields: [receiptItems.receiptId], references: [receipts.id] }),
}));

export const jobPhotosRelations = relations(jobPhotos, ({ one }) => ({
  job: one(jobs, { fields: [jobPhotos.jobId], references: [jobs.id] }),
}));

export const jobCategoriesRelations = relations(jobCategories, ({ one }) => ({
  organisation: one(organisations, { fields: [jobCategories.orgId], references: [organisations.id] }),
}));

export type Organisation = typeof organisations.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Receipt = typeof receipts.$inferSelect;
export type ReceiptItem = typeof receiptItems.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type Client = typeof clients.$inferSelect;
