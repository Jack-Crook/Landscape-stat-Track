import { confirmTap, expect, fixture, test, watchErrors } from "./helpers";

test("batch scan: a fuel receipt and a photo that isn't a receipt", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/receipts/scan");
  await page.getByTestId("file-input").setInputFiles([fixture("fuel.jpg"), fixture("garden.jpg")]);
  await expect(page.getByText("Ampol · $90.00")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("That doesn't look like a receipt or invoice")).toBeVisible();

  // Fuel lands in the review queue.
  await page.goto("/receipts");
  await expect(page.getByRole("heading", { name: /To review \(1\)/ })).toBeVisible();
  await page.getByRole("link", { name: /Ampol/ }).click();
  await expect(page.getByLabel("Item 1 name")).toHaveValue("Unleaded petrol");
  await expect(page.getByLabel("Item 1 quantity")).toHaveValue("45.23");
  await page.getByRole("button", { name: "Confirm receipt" }).click();
  await expect(page.getByText("Receipt saved")).toBeVisible();
  await expect(page.getByRole("heading", { name: /To review/ })).toHaveCount(0);
  errors.assertClean();
});

test("scanning the same receipt twice warns about a duplicate", async ({ page }) => {
  await page.goto("/receipts/scan");
  await page.getByTestId("file-input").setInputFiles(fixture("fuel.jpg"));
  await expect(page.getByText("Ampol · $90.00")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: "Review" }).click();
  await expect(page.getByText("Possible duplicate")).toBeVisible();
  await expect(page.getByText(/Looks like a receipt you already have/)).toBeVisible();
  await confirmTap(page, "Delete receipt");
  await expect(page).toHaveURL(/\/receipts$/);
});

test("manual receipt: validation, live reconciliation, save", async ({ page }) => {
  await page.goto("/receipts/new");
  await page.getByRole("button", { name: "Confirm receipt" }).click();
  await expect(page.getByText("Who was it from?")).toBeVisible();

  await page.getByLabel("Supplier").fill("Nerang Nursery");
  await page.getByLabel("Total paid").fill("110");
  await page.getByLabel(/GST included/).fill("20");
  await expect(page.getByText("More than 1/11 of the total")).toBeVisible();
  await page.getByRole("button", { name: "GST = 1/11 of total" }).click();
  await expect(page.getByLabel(/GST included/)).toHaveValue("10.00");

  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByLabel("Item 1 name").fill("Lilly pilly");
  await page.getByLabel("Item 1 category").selectOption("plants");
  await page.getByLabel("Item 1 quantity").fill("4");
  await page.getByLabel("Item 1 unit price").fill("25");
  await expect(page.getByLabel("Item 1 total")).toHaveValue("100.00");
  await expect(page.getByText(/Items add up to \$100\.00, \$10\.00 less than the total/)).toBeVisible();
  await page.getByLabel("Item 1 unit price").fill("27.50");
  await expect(page.getByText("Items add up to the total ($110.00).")).toBeVisible();

  await page.getByRole("button", { name: "Confirm receipt" }).click();
  await expect(page.getByText("Receipt saved")).toBeVisible();
  await expect(page.getByRole("link", { name: /Nerang Nursery/ })).toBeVisible();

  await page.goto("/spending/item?name=Lilly%20pilly");
  await expect(page.getByText("$27.50").first()).toBeVisible();
});

test("receipts search finds items inside receipts", async ({ page }) => {
  await page.goto("/receipts?period=all");
  await page.getByLabel("Search receipts").fill("petrol");
  await page.getByLabel("Search receipts").press("Enter");
  await expect(page.getByRole("link", { name: /Ampol/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Nerang Nursery/ })).toHaveCount(0);
});

test("uploaded receipt image is served to its owner only with safe headers", async ({ page }) => {
  await page.goto("/receipts?period=all");
  const img = page.locator("img[src^='/api/files/']").first();
  const src = await img.getAttribute("src");
  const res = await page.request.get(src!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toMatch(/^image\//);
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
});

test("scan API rejects unsupported files", async ({ request }) => {
  const res = await request.post("/api/receipts/scan", {
    multipart: { file: { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") } },
  });
  expect(res.status()).toBe(415);
  expect((await res.json()).error).toMatch(/photo|PDF/);
});
