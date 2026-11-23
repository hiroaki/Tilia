import { resolve } from "node:path";
import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import { mockPhotoExif, timestampPhoto } from "../helpers/photo-exif.js";

test.beforeEach(async ({ page }) => mockPhotoExif(page));

const sampleTrackPath = resolve(import.meta.dirname, "../fixtures/img-2892-auto-helper.gpx");

test("viewer sample infers a photo location from an imported GPX track", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/tests/fixtures/viewer/");

  await page.locator('.tilia-file-import-control input[type="file"]').setInputFiles([
    { name: "img-2892-auto-helper.gpx", mimeType: "application/gpx+xml", buffer: readFileSync(sampleTrackPath) },
    timestampPhoto,
  ]);

  await expect(page.locator(".tilia-status-text")).toContainText("IMG_2892.JPG");
  await expect(page.locator(".tilia-status-text")).toContainText("gpx-time-inference");

  await page.getByRole("button", { name: "Layers" }).click();
  const trackLayer = page.locator(".tilia-layer-item").filter({
    has: page.locator(".tilia-layer-name", { hasText: "img-2892-auto-helper.gpx" }),
  });
  const photoLayer = page.locator(".tilia-layer-item").filter({
    has: page.locator(".tilia-layer-name", { hasText: "IMG_2892.JPG" }),
  });

  await expect(trackLayer).toHaveCount(1);
  await expect(photoLayer).toHaveCount(1);
  await expect(photoLayer.locator(".tilia-layer-meta")).toContainText("gpx-time-inference");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(settings.locator(".tilia-entry-settings")).toHaveCount(1);
  const mode = settings.getByRole("combobox", { name: "IMG_2892.JPG photo time mode" });
  await expect(mode).toHaveValue("auto"); await mode.selectOption("utc"); await expect(mode).toHaveValue("utc");
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await expect(photoLayer.locator(".tilia-layer-meta")).toContainText("gpx-time-inference");

  expect(pageErrors).toEqual([]);
});
