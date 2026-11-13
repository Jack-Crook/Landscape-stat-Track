import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against a production build with:
 *  - its own database (TEST_DATABASE_URL, wiped by tests/e2e/global-setup.ts),
 *  - AUTH_MODE=dev (no Clerk), RECEIPT_SCANNER=mock (no API calls).
 *
 * Needs a Postgres reachable at TEST_DATABASE_URL, e.g. the podman one:
 *   podman start landscape-pg   (port 5433, database landscape_test)
 */
const PORT = 3200;
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/landscape_test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1, // one shared database
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "en-AU",
    timezoneId: "Australia/Brisbane",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL ?? "chrome" } },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], channel: process.env.PW_CHANNEL ?? "chrome" },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/manifest.webmanifest`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI && !!process.env.PW_REUSE_SERVER,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      AUTH_MODE: "dev",
      RECEIPT_SCANNER: "mock",
      TZ: "Australia/Brisbane",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
