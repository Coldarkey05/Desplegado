import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 120000,
  expect: { timeout: 12000 },
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.FRONTEND_URL ?? "http://127.0.0.1:5173",
    headless: true,
    launchOptions: process.env.TEST_BROWSER_OPTIONS ? JSON.parse(process.env.TEST_BROWSER_OPTIONS) : {},
    actionTimeout: 15000,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  reporter: [["list"]],
});
