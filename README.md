# Landscape Tracker

Jobs, quotes, invoices, receipts, profit and GST for a small landscaping business. It's a mobile-first web app that can be added to a phone's home screen.

**What it does**

- **Receipt scanning.** Snap or upload receipts (photos or PDFs, several at once). Claude reads every line: supplier, ABN, date, payment, GST, and each item with its quantity, unit price and category. Receipts land in a review queue where the photo sits beside an editable form. Totals are reconciled, and problems are flagged: lines that don't add up, an invalid ABN, a likely duplicate, or a missing tax invoice over $82.50.
- **Spending explorer.** Ask "what did I spend on shovels?" Totals by item, category and supplier, price history per item, and the cheapest supplier for each item. Prices are compared within one unit, so a 50 L bag is never compared with a m³.
- **Jobs.** A status pipeline (quoted → in progress → completed → invoiced → paid), cost lines, mileage at the ATO rate, hours, linked receipts, before/after photos, and recurring jobs that book their next visit. Live profit, margin, profit per hour, and expected vs actual costs.
- **Quotes.** Line items with live GST totals, a pricing helper (target margin plus your usual margin for that kind of work), PDF output, outcome tracking, and one tap to turn a quote into a job.
- **Invoices.** Proper AU tax invoice PDFs (ABN, GST, bank details), numbering, due dates, overdue tracking, recording payments, and email drafts.
- **Profit & loss.** Any period, on a cash or accrual basis, with expenses by category (food is left out as non-deductible) and CSV exports for your accountant.
- **Tax & GST.** BAS figures per quarter or month (G1, 1A, G10, G11, 1B, net) with ATO due dates. A sole trader or company income tax estimate with Stage 3 rates, Medicare, LITO and the small business offset. A "put aside" figure, a GST registration watch at $75k, and GST credits at risk.
- **Insights.** Win rate by kind of work and by quote size, margin and profit per hour by category, cost blowouts, best clients, slow payers, and seasonality.

Stack: Next.js 16 (App Router, server actions), Postgres via Drizzle (node-postgres; Neon in production), Clerk auth, Claude via `@anthropic-ai/sdk` structured outputs, `@react-pdf/renderer`, Tailwind v4, Vitest, and Playwright.

## Run it locally (no accounts needed)

```bash
npm install
podman run -d --name landscape-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=landscape -p 5433:5432 docker.io/library/postgres:17
# (later: podman start landscape-pg)
cp .env.local.example .env.local
# set: DATABASE_URL=postgres://postgres:postgres@localhost:5433/landscape
#      AUTH_MODE=dev
#      RECEIPT_SCANNER=mock      (or ANTHROPIC_API_KEY=... to scan for real)
npm run db:push
npm run db:seed          # ~15 months of demo data; `-- --reset` to redo
npm run dev
```

## Production (Vercel + Neon + Clerk)

1. Set `DATABASE_URL` (Neon **pooled** URL), the Clerk keys and `ANTHROPIC_API_KEY` in Vercel. Do **not** set `AUTH_MODE` or `RECEIPT_SCANNER`.
2. `npm run db:push` against Neon. The schema change only **adds** tables and columns, so existing data is kept and old receipts become "confirmed".
3. The Clerk webhook is optional: users are created on first sign-in.

Receipt photos are stored in Postgres (downscaled to about 400 KB in the browser). Neon's free 0.5 GB holds roughly a thousand receipts; move them to R2/S3 if it grows past that.

## Tests

```bash
npm test             # unit (GST, tax, BAS periods, P&L maths, receipt normalising) + integration (real Postgres)
npm run test:e2e     # Playwright: production build, AUTH_MODE=dev, mock scanner, its own database
npm run typecheck && npm run lint
```

Integration and e2e tests need Postgres on `localhost:5433` (the podman container). Their databases are `landscape_it` and `landscape_test`, and e2e wipes `landscape_test` on every run.

## Money conventions

- Everything is computed in integer cents (`src/lib/money.ts`).
- Receipt and invoice totals are GST-inclusive, with the GST stored alongside. Quote and invoice line prices are GST-exclusive.
- Job profit is GST-exclusive. Receipts in "needs review" don't count anywhere until confirmed.
- Tax rates live in `src/lib/tax.ts`, keyed by financial year. Everything tax-related is labelled as an estimate.

## Notes

- `src/app/(dashboard)` has no `loading.tsx` on purpose. In this Next 16 build, a route-level Suspense boundary left server-action forms stuck on "pending" after revalidation in production. Links show a pending spinner (`useLinkStatus`) instead.
- `src/lib/finance.ts` is pure and unit-tested; the `src/lib/data/*` loaders feed it.
