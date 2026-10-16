import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.js",
  projects: [
    { name: "regression", testDir: "./tests/smoke" },
    { name: "samples", testDir: "./tests/samples" },
  ],
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? [["html", { outputFolder: "playwright-report" }], ["list"]] : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run serve -- 4173",
    url: "http://127.0.0.1:4173/tests/fixtures/application-lifecycle.html",
    reuseExistingServer: !process.env.CI,
  },
});
