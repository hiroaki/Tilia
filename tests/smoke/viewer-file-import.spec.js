import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const sampleTrackPath = resolve(import.meta.dirname, "../fixtures/sample-track.gpx");

test("viewer sample imports a GPX file and reflects it in the layers panel", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/samples/viewer/");

  await page.locator('.tilia-file-import-control input[type="file"]').setInputFiles(sampleTrackPath);

  await expect(page.locator(".tilia-status-text")).toContainText("Loaded 1 file(s) from file.");
  await expect(page.locator(".tilia-status-text")).toContainText("sample-track.gpx");

  await page.getByRole("button", { name: "Layers" }).click();
  await expect(page.locator(".tilia-side-panel:not(.tilia-side-panel-hidden)")).toBeVisible();
  await expect(page.locator(".tilia-layer-name")).toContainText("sample-track.gpx");
  await expect(page.locator(".tilia-layer-meta")).toContainText("3 track points / 1 waypoints");

  await page.getByRole("button", { name: "Delete all" }).click();
  await expect(page.locator(".tilia-layer-empty")).toContainText("No layers");
  await expect(page.locator(".tilia-status-text")).toContainText("Cleared all layers and sources");

  expect(pageErrors).toEqual([]);
});