import { expect, test } from "@playwright/test";

test("Phase 4C shell, status, and base-map milestone", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/tests/fixtures/phase-4c/");
  await expect(page.locator("body")).toHaveAttribute("data-phase4c-ready", "true");
  await expect(page.locator("#map.leaflet-container")).toBeVisible();
  await expect(page.locator(".tilia-status-text")).toHaveText("Ready");
  const selector = page.locator(".tilia-base-map-select");
  await expect(selector).toBeVisible();
  await expect(selector.locator("option")).toHaveCount(4);
  await selector.selectOption("opentopomap");
  await expect(selector).toHaveValue("opentopomap");
  await expect(page.locator(".tilia-status-text")).toContainText("OpenTopoMap");
  expect(errors).toEqual([]);
});

test("Phase 4C provider and control uninstall/reinstall leaves no duplicates", async ({ page }) => {
  await page.goto("/tests/fixtures/phase-4c/");
  await expect(page.locator("body")).toHaveAttribute("data-phase4c-ready", "true");
  await page.evaluate(() => window.phase4cApp.unuse("x-opentopomap-base-maps"));
  await expect(page.locator('.tilia-base-map-select option[value="opentopomap"]')).toHaveCount(0);
  await page.evaluate(() => window.phase4cApp.use("x-opentopomap-base-maps"));
  await expect(page.locator('.tilia-base-map-select option[value="opentopomap"]')).toHaveCount(1);
  await page.evaluate(() => window.phase4cApp.unuse("tilia-base-maps-control"));
  await expect(page.locator(".tilia-base-map-control")).toHaveCount(0);
  await page.evaluate(() => window.phase4cApp.use("tilia-base-maps-control"));
  await expect(page.locator(".tilia-base-map-control")).toHaveCount(1);
  await page.evaluate(() => window.phase4cApp.unuse("tilia-status"));
  await expect(page.locator(".tilia-status-control")).toHaveCount(0);
  await page.evaluate(() => window.phase4cApp.use("tilia-status"));
  await expect(page.locator(".tilia-status-control")).toHaveCount(1);
});
