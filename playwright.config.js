import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/smoke",
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? [["html", { outputFolder: "playwright-report" }], ["list"]] : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  webServer: {
    command: "ruby -run -e httpd . -p 4173",
    url: "http://127.0.0.1:4173/samples/viewer/",
    reuseExistingServer: !process.env.CI,
  },
});