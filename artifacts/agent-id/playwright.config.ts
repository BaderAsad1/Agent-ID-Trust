import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

const baseURL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "http://localhost:80");

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.ts$/,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
