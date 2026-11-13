import type { Page } from "@playwright/test";
import { expect, fixture, test, waitForHydrationOnGoto, watchErrors } from "./helpers";

/*
 * The whole money loop for one job, with every number checked by hand:
 *
 *   Quote: 2 × $500 + 1 × $250 = $1,250 ex GST, + $125 GST = $1,375.00
 *   Costs (ex GST): pavers $220 incl GST → $200; mileage 25 km × $0.88 = $22;
 *                   Bunnings receipt $186.60 − $16.33 GST = $170.27
 *   Job costs = $392.27 → profit $857.73, margin 68.6% → 69%, 5 h → $171.55/h
 *   Expected costs $600 → $207.73 under.
 *
 *   P&L this month: income $1,250; expenses exclude the $7 sausage sizzle (food,
 *   not deductible): 200 + 22 + (186.60 − 7 − 16.33) = $385.27 → profit $864.73.
 *   BAS: 1A $125.00, 1B $16.33 + $20.00 = $36.33 → net $88.67.
 */

test.describe.configure({ mode: "serial" });

let page: Page;
let jobUrl = "";

test.beforeAll(async ({ browser }) => {
  page = waitForHydrationOnGoto(await browser.newPage());
});
test.afterAll(async () => {
  await page.close();
});

test("add a client", async () => {
  await page.goto("/clients/new");
  await page.getByLabel("Name").fill("Sarah Mitchell");
  await page.getByLabel("Phone").fill("0412 555 101");
  await page.getByLabel("Email").fill("sarah@example.com");
  await page.getByLabel("Address").fill("14 Banksia Ct, Mudgeeraba QLD 4213");
  await page.getByRole("button", { name: "Add client" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sarah Mitchell");
  await expect(page.getByRole("link", { name: /0412 555 101/ })).toHaveAttribute("href", "tel:0412555101");
});

test("client form validates", async () => {
  await page.goto("/clients/new");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Add client" }).click();
  await expect(page.getByText("Client name is required")).toBeVisible();
  await expect(page.getByText("Enter a valid email")).toBeVisible();
});

test("quote with live totals and pricing helper", async () => {
  const errors = watchErrors(page);
  await page.goto("/clients");
  await page.getByRole("link", { name: /Sarah Mitchell/ }).click();
  await page.getByRole("link", { name: "New quote" }).click();
  await expect(page.getByLabel("Client")).toHaveValue(/.+/);

  await page.getByLabel("Title").fill("Back patio paving");
  await page.getByLabel("Category").fill("Paving");
  await page.getByLabel("Line 1 description").fill("Sandstone pavers supply & lay (m²)");
  await page.getByLabel("Line 1 quantity").fill("2");
  await page.getByLabel("Line 1 unit price").fill("500");
  await page.getByRole("button", { name: "Add line" }).click();
  await page.getByLabel("Line 2 description").fill("Site prep & base");
  await page.getByLabel("Line 2 unit price").fill("250");
  await expect(page.getByTestId("line-items-total")).toHaveText("$1,375.00");

  await page.getByLabel("Your expected costs (ex GST)").fill("600");
  await expect(page.getByText("Suggested price (ex GST)")).toBeVisible();
  await expect(page.getByText("$923.08")).toBeVisible(); // 600 / (1 − 0.35)
  await expect(page.getByText("52%")).toBeVisible(); // (1250 − 600) / 1250

  await page.getByRole("button", { name: "Create quote" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Back patio paving");
  await expect(page.getByText("Q-0001")).toBeVisible();
  await expect(page.getByText("$1,375.00").first()).toBeVisible();
  errors.assertClean();
});

test("quote PDF renders", async () => {
  const href = await page.getByRole("link", { name: "PDF" }).getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect((await res.body()).subarray(0, 4).toString()).toBe("%PDF");
});

test("send and accept the quote → job", async () => {
  await page.getByRole("button", { name: "Mark as sent" }).click();
  await expect(page.getByText("Sent", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Accepted: create job" }).click();
  await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]{36}$/);
  jobUrl = page.url();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Back patio paving");
  await expect(page.getByText("$1,375.00")).toBeVisible();
});

test("log costs, mileage and hours", async () => {
  await page.getByLabel("What for").fill("Pavers top-up");
  await page.getByLabel("Amount").fill("220");
  await page.getByRole("button", { name: "Add cost" }).click();
  await expect(page.getByText("Pavers top-up")).toBeVisible();
  await expect(page.getByText("incl. $20.00 GST")).toBeVisible();

  await page.getByLabel("Distance (km)").fill("25");
  await page.getByLabel("Trip").fill("Yard → site → yard");
  await page.getByRole("button", { name: "Log trip" }).click();
  const trip = page.getByRole("listitem").filter({ hasText: "25 km" });
  await expect(trip).toContainText("$22.00");

  await page.getByLabel("Add hours").fill("5");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("5 h added")).toBeVisible();
});

test("scan a receipt for the job and confirm it", async () => {
  await page.getByRole("link", { name: "Scan for this job" }).click();
  await expect(page.getByText("Receipts will be linked to")).toBeVisible();
  await page.getByTestId("file-input").setInputFiles(fixture("bunnings.jpg"));
  await expect(page.getByText("Bunnings Warehouse · $186.60")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("5 items found")).toBeVisible();
  await page.getByRole("link", { name: "Review" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Review receipt");
  await expect(page.getByTestId("receipt-item")).toHaveCount(5);
  await expect(page.getByLabel("Item 1 name")).toHaveValue("Shovel");
  await expect(page.getByLabel("Total paid")).toHaveValue("186.60");
  await expect(page.getByLabel(/GST included/)).toHaveValue("16.33");
  await expect(page.getByText("Items add up to the total ($186.60).")).toBeVisible();
  await expect(page.getByLabel("Job")).not.toHaveValue("");

  await page.getByRole("button", { name: "Confirm receipt" }).click();
  await expect(page.getByText("Receipt saved")).toBeVisible();
  await expect(page.getByRole("link", { name: /Bunnings Warehouse/ })).toBeVisible();
});

test("job profit adds up", async () => {
  await page.goto(jobUrl);
  await expect(page.locator(".hero-figure")).toHaveText("$857.73");
  const profit = page.locator("section").filter({ has: page.getByRole("heading", { name: "Profit" }) });
  await expect(profit.getByText("Margin").locator("..")).toContainText("69%");
  await expect(profit.getByText("Per hour").locator("..")).toContainText("$171.55");
  await expect(page.getByText("$207.73 under your expected costs of $600.00.")).toBeVisible();
});

test("progress to invoiced raises an invoice from the quote lines", async () => {
  await page.getByRole("button", { name: /Completed/ }).click();
  await expect(page.getByRole("button", { name: /Completed/ })).toHaveAttribute("aria-current", "step");
  await page.getByRole("button", { name: /Invoiced/ }).click();
  await expect(page.getByRole("button", { name: /Invoiced/ })).toHaveAttribute("aria-current", "step");
  await page.getByRole("link", { name: /INV-0001/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("INV-0001");
  await expect(page.getByText("Sandstone pavers supply & lay (m²)")).toBeVisible();
  await expect(page.getByTestId("invoice-total")).toHaveText("$1,375.00");
});

test("invoice PDF renders as a tax invoice", async () => {
  const href = await page.getByRole("link", { name: "PDF" }).getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.headers()["content-type"]).toBe("application/pdf");
});

test("record payment → job paid", async () => {
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText(/^Paid \d/)).toBeVisible();
  await page.goto(jobUrl);
  await expect(page.getByRole("button", { name: /Paid/ })).toHaveAttribute("aria-current", "step");
});

test("profit & loss for the month", async () => {
  await page.goto("/reports?period=month");
  const tiles = page.locator("main");
  await expect(tiles.getByText("$1,250.00").first()).toBeVisible();
  await expect(tiles.getByText("$385.27").first()).toBeVisible();
  await expect(tiles.getByText("$864.73").first()).toBeVisible();
  await expect(page.getByText(/\$7\.00 of food and drink is left out/)).toBeVisible();
});

test("BAS figures for the quarter", async () => {
  await page.goto("/tax");
  await expect(page.getByText("GST to pay so far")).toBeVisible();
  await expect(page.locator(".hero-figure")).toHaveText("$88.67");
  await expect(page.getByText("$125.00").first()).toBeVisible();
  await expect(page.getByText("$36.33").first()).toBeVisible();
});

test("spending knows what the shovels cost", async () => {
  await page.goto("/spending");
  await page.getByLabel("Search items").fill("shovel");
  await page.getByLabel("Search items").press("Enter");
  await expect(page.getByRole("link", { name: /Shovel/ })).toBeVisible();
  await page.getByRole("link", { name: /Shovel/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shovel");
  await expect(page.getByText("$77.96").first()).toBeVisible();
  await expect(page.getByText("CYCLONE SHOVEL RND MOUTH FIBREGLASS")).toBeVisible();
});

test("home dashboard reflects the month", async () => {
  await page.goto("/");
  await expect(page.getByTestId("hero-profit")).toHaveText("$864.73");
});

test("insights pick up the finished job", async () => {
  await page.goto("/insights");
  await expect(page.getByRole("cell", { name: "Paving" })).toBeVisible();
  await expect(page.getByText("100%").first()).toBeVisible(); // 1 of 1 quotes won
});

test("CSV exports download", async () => {
  for (const kind of ["receipts", "items", "invoices", "jobs", "pl"]) {
    const res = await page.request.get(`/api/export/${kind}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    const text = await res.text();
    expect(text.split("\r\n").length).toBeGreaterThan(1);
  }
  const items = await (await page.request.get("/api/export/items")).text();
  expect(items).toContain("Shovel");
});
