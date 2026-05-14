import { expect, test } from "@playwright/test";

test("viewer sample boots and renders the main controls", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/samples/viewer/");

  await expect(page.locator("#map.leaflet-container")).toBeVisible();
  await expect(page.locator(".tilia-base-map-control .tilia-base-map-select")).toBeVisible();
  await expect(page.locator(".tilia-file-import-control .tilia-file-label")).toBeVisible();
  await expect(page.locator(".tilia-status-control")).toBeVisible();
  await expect(page.locator(".tilia-settings-control button")).toBeVisible();

  expect(pageErrors).toEqual([]);
});