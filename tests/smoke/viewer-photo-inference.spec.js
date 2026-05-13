import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const sampleTrackPath = resolve(import.meta.dirname, "../../samples/embed/biwakososui.gpx");
const sampleInferredPhotoPath = resolve(import.meta.dirname, "../../samples/embed/IMG_2892.JPG");

test("viewer sample infers a photo location from an imported GPX track", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/samples/viewer/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.locator(".tilia-default-time-mode-select").selectOption("jst");
  await page.getByRole("button", { name: "Close" }).click();

  await page.locator('.tilia-file-import-control input[type="file"]').setInputFiles([
    sampleTrackPath,
    sampleInferredPhotoPath,
  ]);

  await expect(page.locator(".tilia-status-text")).toContainText("IMG_2892.JPG");
  await expect(page.locator(".tilia-status-text")).toContainText("gpx-time-inference");
  await expect(page.locator(".tilia-status-text")).toContainText("mode=jst");

  await page.getByRole("button", { name: "Layers" }).click();
  const trackLayer = page.locator(".tilia-layer-item").filter({
    has: page.locator(".tilia-layer-name", { hasText: "biwakososui.gpx" }),
  });
  const photoLayer = page.locator(".tilia-layer-item").filter({
    has: page.locator(".tilia-layer-name", { hasText: "IMG_2892.JPG" }),
  });

  await expect(trackLayer).toHaveCount(1);
  await expect(photoLayer).toHaveCount(1);
  await expect(photoLayer.locator(".tilia-layer-meta")).toContainText("gpx-time-inference");
  await expect(photoLayer.locator(".tilia-layer-mode-select")).toHaveCount(1);

  expect(pageErrors).toEqual([]);
});