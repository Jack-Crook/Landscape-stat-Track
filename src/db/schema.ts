import {
  pgTable,
  text,
  timestamp,
  numeric,
  integer,
  boolean,
  pgEnum,
  index,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

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

export const costTypeEnum = pgEnum("cost_type", [
  "materials",
  "labour",
  "travel",
  "other",
]);

export const userRoleEnum = pgEnum("user_role", ["owner", "employee"]);

export const recurrenceEnum = pgEnum("recurrence_interval", [
  "weekly",
  "fortnightly",
  "monthly",
]);

// ─── Organisation ─────────────────────────────────────────────────────────────
// Top-level tenant. org_id is the multi-tenancy key on every other table.

export const organisations = pgTable("organisations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  abn: text("abn"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("10.00"),
  subscriptionTier: text("subscription_tier").notNull().default("starter"),
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
    status: jobStatusEnum("status").notNull().default("quoted"),
    quotedPrice: numeric("quoted_price", { precision: 10, scale: 2 }),
    actualCost: numeric("actual_cost", { precision: 10, scale: 2 }),
    profit: numeric("profit", { precision: 10, scale: 2 }),
    startDate: timestamp("start_date"),
    endDate: timestamp("end_date"),
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
    title: text("title").notNull(),
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

// ─── Receipts ─────────────────────────────────────────────────────────────────

export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    // Nullable: general business expense if not linked to a job
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    vendor: text("vendor").notNull(),
    date: timestamp("date").notNull(),
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }),
    gstAmount: numeric("gst_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 10, scale: 2 }).notNull(),
    category: text("category"),
    notes: text("notes"),
    imageUrl: text("image_url"),
    rawOcrData: text("raw_ocr_data"), // JSON string from Claude Vision
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("receipts_org_idx").on(t.orgId),
    index("receipts_job_idx").on(t.jobId),
    index("receipts_date_idx").on(t.date),
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
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  organisation: one(organisations, { fields: [jobs.orgId], references: [organisations.id] }),
  client: one(clients, { fields: [jobs.clientId], references: [clients.id] }),
  costLines: many(costLines),
  mileageLogs: many(mileageLogs),
  photos: many(jobPhotos),
  receipts: many(receipts),
  quotes: many(quotes),
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

export const receiptsRelations = relations(receipts, ({ one }) => ({
  organisation: one(organisations, { fields: [receipts.orgId], references: [organisations.id] }),
  job: one(jobs, { fields: [receipts.jobId], references: [jobs.id] }),
}));

export const jobPhotosRelations = relations(jobPhotos, ({ one }) => ({
  job: one(jobs, { fields: [jobPhotos.jobId], references: [jobs.id] }),
}));

export const jobCategoriesRelations = relations(jobCategories, ({ one }) => ({
  organisation: one(organisations, { fields: [jobCategories.orgId], references: [organisations.id] }),
}));
