import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const sampleTrackPath = resolve(import.meta.dirname, "../fixtures/sample-track.gpx");

test("viewer elevation panel renders a profile for an imported GPX track", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/samples/viewer/");

  await page.locator('.tilia-file-import-control input[type="file"]').setInputFiles(sampleTrackPath);
  await expect(page.locator(".tilia-status-text")).toContainText("sample-track.gpx");

  await page.getByRole("button", { name: "Elevation" }).click();
  await expect(page.locator(".tilia-side-panel:not(.tilia-side-panel-hidden)")).toBeVisible();
  await expect(page.locator(".tilia-side-panel-title")).toHaveText("Elevation");
  await expect(page.locator(".tilia-side-panel")).toHaveClass(/tilia-side-panel-layout-bottom/);
  await expect(page.locator(".tilia-elevation-chart")).toBeVisible();
  await expect(page.locator(".tilia-elevation-chart")).toHaveAttribute("aria-label", "Elevation profile");
  await expect(page.locator(".tilia-status-text")).toContainText("Selected sample-track.gpx elevation profile");

  const bottomPanelBox = await page.locator(".tilia-side-panel:not(.tilia-side-panel-hidden)").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  });
  const statusControlBox = await page.locator(".tilia-status-control").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  });
  expect(statusControlBox.bottom).toBeLessThanOrEqual(bottomPanelBox.top);

  expect(pageErrors).toEqual([]);
});