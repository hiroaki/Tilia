import { resolve } from "node:path";
import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import { mockPhotoExif, timestampPhoto } from "../helpers/photo-exif.js";

test.beforeEach(async ({ page }) => mockPhotoExif(page));
test.use({ timezoneId: "Asia/Tokyo" });

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
  const captured = photoLayer.locator(".tilia-layer-meta");
  await expect(captured).toHaveText("2013/11/24 15:22:39 +00:00");
  await expect(trackLayer.locator(".tilia-photo-time-mode-select")).toHaveCount(0);
  const mode = photoLayer.getByRole("combobox", { name: "IMG_2892.JPG photo time mode" });
  await expect(mode).toHaveValue("auto"); await mode.selectOption("utc"); await expect(mode).toHaveValue("utc");
  await expect(captured).toHaveText("2013/11/24 15:22:39 +00:00");

  expect(pageErrors).toEqual([]);
});
