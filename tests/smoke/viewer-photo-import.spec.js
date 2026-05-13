import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const sampleGpsPhotoPath = resolve(import.meta.dirname, "../../samples/embed/IMG_2889.JPG");

test("viewer sample imports a GPS-tagged photo and shows it as an EXIF-based layer", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/samples/viewer/");

  await page.locator('.tilia-file-import-control input[type="file"]').setInputFiles(sampleGpsPhotoPath);

  await expect(page.locator(".tilia-status-text")).toContainText("IMG_2889.JPG");
  await expect(page.locator(".tilia-status-text")).toContainText("exif-gps");

  await page.getByRole("button", { name: "Layers" }).click();
  await expect(page.locator(".tilia-layer-name")).toContainText("IMG_2889.JPG");
  await expect(page.locator(".tilia-layer-meta")).toContainText("exif-gps");
  await expect(page.locator(".tilia-layer-mode-select")).toHaveCount(0);

  expect(pageErrors).toEqual([]);
});