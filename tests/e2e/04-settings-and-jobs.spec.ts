import { confirmTap, expect, fixture, test, unique } from "./helpers";

test("settings validate ABN and BSB, then save", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("ABN").fill("12 345 678 901");
  await page.getByLabel("BSB").fill("123");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("That ABN doesn't pass the ATO check")).toBeVisible();
  await expect(page.getByText("A BSB is 6 digits")).toBeVisible();

  await page.getByLabel("Business name").fill("Green Edge Landscaping");
  await page.getByLabel("ABN").fill("51 824 753 556");
  await page.getByLabel("BSB").fill("064000");
  await page.getByLabel("Account number").fill("12345678");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).locator("..").getByText("Green Edge Landscaping")).toBeVisible();
});

test("job categories can be added and removed", async ({ page }) => {
  await page.goto("/settings");
  const name = unique("Pool landscaping");
  await page.getByLabel("New category").fill(name);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(name)).toBeVisible();
  await page.getByRole("button", { name: `Remove ${name}` }).click();
  await expect(page.getByText(name)).toHaveCount(0);
});

test("turning GST off re-prices job profit", async ({ page }) => {
  await page.goto("/jobs/new");
  const name = unique("GST check");
  await page.getByLabel("Job name").fill(name);
  await page.getByLabel(/Price to client/).fill("1100");
  await page.getByRole("button", { name: "Create job" }).click();
  await expect(page.locator(".hero-figure")).toHaveText("$1,000.00"); // ex GST

  await page.goto("/settings");
  await page.getByText("Registered for GST").click();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();

  await page.goto("/jobs?status=all");
  await page.getByRole("link", { name: new RegExp(name) }).click();
  await expect(page.locator(".hero-figure")).toHaveText("$1,100.00"); // no GST to remove
  await expect(page.getByText("GST to pay")).toHaveCount(0);

  // Restore for later tests.
  await page.goto("/settings");
  await page.getByText("Registered for GST").click();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
});

test("job validation, edit, recurring booking and delete", async ({ page }) => {
  await page.goto("/jobs/new");
  await page.getByRole("button", { name: "Create job" }).click();
  await expect(page.getByText("Give the job a name")).toBeVisible();

  const name = unique("Fortnightly mow");
  await page.getByLabel("Job name").fill(name);
  await page.getByLabel("Category").fill("Lawn mowing");
  await page.getByLabel(/Price to client/).fill("88");
  await page.getByLabel("Start").fill("2026-11-02");
  await page.getByText("Repeats").click();
  await page.getByLabel("How often").selectOption("fortnightly");
  await page.getByRole("button", { name: "Create job" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page.getByText("Fortnightly", { exact: true })).toBeVisible();

  // Completing books the next visit two weeks later.
  await page.getByRole("button", { name: /Completed/ }).click();
  await expect(page.getByRole("button", { name: /Completed/ })).toHaveAttribute("aria-current", "step");
  await page.goto("/jobs?status=quoted");
  await expect(page.getByRole("link", { name: new RegExp(name) })).toHaveCount(1);
  await expect(page.getByRole("link", { name: new RegExp(`${name}.*16 Nov 2026`) })).toBeVisible();

  // Edit then delete the original.
  await page.goto("/jobs?status=completed");
  await page.getByRole("link", { name: new RegExp(name) }).click();
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Job name").fill(`${name} (edited)`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${name} (edited)`);
  await page.getByRole("link", { name: "Edit" }).click();
  await confirmTap(page, "Delete job");
  await expect(page).toHaveURL(/\/jobs$/);
});

test("quote outcomes feed the win rate", async ({ page }) => {
  await page.goto("/quotes/new");
  await page.getByLabel("Title").fill(unique("Hedge trim quote"));
  await page.getByLabel("Category").fill("Hedging & pruning");
  await page.getByLabel("Line 1 description").fill("Trim hedges");
  await page.getByLabel("Line 1 unit price").fill("300");
  await page.getByRole("button", { name: "Create quote" }).click();
  await page.getByRole("button", { name: "Declined" }).click();
  await expect(page.getByText("Declined", { exact: true }).first()).toBeVisible();
  await page.goto("/quotes");
  await expect(page.getByText("50%")).toBeVisible(); // 1 accepted earlier + 1 declined
});

test("invoice by hand: draft → sent → void", async ({ page }) => {
  await page.goto("/invoices/new");
  await page.getByLabel("Line 1 description").fill("Green waste removal");
  await page.getByLabel("Line 1 unit price").fill("180");
  await expect(page.getByTestId("line-items-total")).toHaveText("$198.00");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByText("Drafts don't count as income")).toBeVisible();
  await page.getByRole("button", { name: "Mark as sent" }).click();
  await expect(page.getByText("Awaiting payment")).toBeVisible();
  await confirmTap(page, "Void invoice");
  await expect(page.getByText("This invoice is cancelled")).toBeVisible();
});

test("before and after photos on a job", async ({ page }) => {
  await page.goto("/jobs/new");
  await page.getByLabel("Job name").fill(unique("Photo job"));
  await page.getByRole("button", { name: "Create job" }).click();
  await expect(page.getByText("No photos yet.")).toBeVisible();
  await page.getByRole("radio", { name: "Before" }).click();
  await page.getByTestId("photo-input").setInputFiles(fixture("garden.jpg"));
  await expect(page.getByRole("img", { name: "Before photo" })).toBeVisible();
  await page.getByRole("radio", { name: "After" }).click();
  await page.getByTestId("photo-input").setInputFiles(fixture("garden.jpg"));
  await expect(page.getByRole("img", { name: "After photo" })).toBeVisible();
  await page.getByRole("img", { name: "Before photo" }).hover();
  await page.getByRole("button", { name: "Delete photo" }).first().click();
  await expect(page.getByRole("img", { name: "Before photo" })).toHaveCount(0);
});
