import { expect, fixture, test, watchErrors } from "./helpers";

test.skip(({ isMobile }) => !isMobile, "phone layout only");

test("tab bar navigation and More menu", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  const tabs = page.getByRole("navigation", { name: "Tabs" });
  await expect(tabs).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();

  await tabs.getByRole("link", { name: "Jobs" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Jobs");
  await tabs.getByRole("link", { name: "More" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("More");
  await page.getByRole("link", { name: "Tax & GST" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tax & GST");
  await expect(tabs.getByRole("link", { name: "More" })).toHaveAttribute("aria-current", "page");
  errors.assertClean();
});

test("scan from the centre tab with the camera input", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Scan a receipt" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Scan receipts");
  await expect(page.getByTestId("camera-input")).toHaveAttribute("capture", "environment");
  await page.getByTestId("camera-input").setInputFiles(fixture("fuel.jpg"));
  await expect(page.getByText(/Ampol · \$90\.00/)).toBeVisible({ timeout: 30_000 });
});

test("no horizontal scrolling on key pages", async ({ page }) => {
  for (const path of ["/", "/jobs", "/receipts", "/spending", "/reports", "/tax", "/insights", "/quotes/new", "/receipts/new"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1);
  }
});
