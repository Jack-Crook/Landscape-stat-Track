import { test as base, expect, type Page } from "@playwright/test";
import path from "node:path";

export const fixture = (name: string) => path.join(process.cwd(), "tests", "e2e", "fixtures", name);

/** Fails the test on any uncaught page error or console error (expected 422 "not a receipt" responses aside). */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Download the React DevTools|favicon|status of 422/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return {
    assertClean: () => expect(errors, errors.join("\n")).toEqual([]),
  };
}

/** Destructive buttons need two taps (ConfirmSubmit). */
export async function confirmTap(page: Page, name: string | RegExp) {
  await page.getByRole("button", { name }).click();
  await page.getByRole("button", { name: /tap again|^delete$/i }).click();
}

export const unique = (prefix: string) => `${prefix} ${Date.now().toString(36).slice(-5)}`;

/** Makes page.goto wait until React has hydrated, so the first click/upload is handled. */
export function waitForHydrationOnGoto(page: Page) {
  const goto = page.goto.bind(page);
  page.goto = async (url, opts) => {
    const res = await goto(url, opts);
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
    return res;
  };
  return page;
}

export const test = base.extend({
  page: async ({ page }, provide) => {
    await provide(waitForHydrationOnGoto(page));
  },
});
export { expect };
