import { expect, test, watchErrors } from "./helpers";

const PAGES: [string, RegExp][] = [
  ["/", /Good (morning|afternoon|evening)/],
  ["/jobs", /^Jobs$/],
  ["/quotes", /^Quotes$/],
  ["/invoices", /^Invoices$/],
  ["/clients", /^Clients$/],
  ["/receipts", /^Receipts$/],
  ["/receipts/scan", /Scan receipts/],
  ["/receipts/new", /Add receipt/],
  ["/spending", /Spending/],
  ["/reports", /Profit & loss/],
  ["/tax", /Tax & GST/],
  ["/insights", /Insights/],
  ["/settings", /Settings/],
  ["/more", /More/],
  ["/jobs/new", /New job/],
  ["/quotes/new", /New quote/],
  ["/invoices/new", /New invoice/],
  ["/clients/new", /New client/],
];

test.describe("every page loads on an empty account", () => {
  for (const [path, heading] of PAGES) {
    test(path, async ({ page }) => {
      const errors = watchErrors(page);
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      errors.assertClean();
    });
  }
});

test("sidebar navigation reaches each section", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const [label, heading] of [
    ["Jobs", "Jobs"],
    ["Spending", "Spending"],
    ["Tax & GST", "Tax & GST"],
    ["Home", /Good/],
  ] as const) {
    await nav.getByRole("link", { name: label }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(nav.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
  }
});

test("unknown pages and other orgs' files 404", async ({ page, request }) => {
  await page.goto("/jobs/00000000-0000-0000-0000-000000000000");
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  const res = await request.get("/api/files/00000000-0000-0000-0000-000000000000");
  expect(res.status()).toBe(404);
  expect((await request.get("/api/export/nope")).status()).toBe(404);
});

test("demo mode has no sign-in wall and sign-in redirects home", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page).toHaveURL("/");
});
