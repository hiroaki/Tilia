import { expect, test } from "@playwright/test";
import { mockPhotoExif, gpsPhoto } from "../helpers/photo-exif.js";

test.beforeEach(async ({ page }) => mockPhotoExif(page));

test("viewer sample imports a GPS-tagged photo and shows it as an EXIF-based layer", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/tests/fixtures/viewer/");

  await page.locator('.tilia-file-import-control input[type="file"]').setInputFiles(gpsPhoto);

  await expect(page.locator(".tilia-status-text")).toContainText("IMG_2889.JPG");
  await expect(page.locator(".tilia-status-text")).toContainText("exif-gps");

  await page.getByRole("button", { name: "Layers" }).click();
  await expect(page.locator(".tilia-layer-name")).toContainText("IMG_2889.JPG");
  const row = page.locator(".tilia-layer-item").filter({ has: page.getByRole("button", { name: "IMG_2889.JPG", exact: true }) });
  await expect(row.locator(".tilia-layer-meta")).toHaveText("2013/11/24 15:17:17");
  await expect(row.locator(".tilia-photo-time-mode-select, .tilia-photo-time-custom")).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Fit IMG_2889.JPG" })).toBeEnabled();

  expect(pageErrors).toEqual([]);
});
