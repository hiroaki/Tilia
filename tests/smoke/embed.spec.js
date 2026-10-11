import { expect, test } from "@playwright/test";

for (const path of ["/samples/embed/", "/samples/embed/index.ja.html"]) test(`embed ${path} boots independent maps and loads its sample assets`, async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto(path);

  await expect(page.locator(".story-map.leaflet-container")).toHaveCount(3);
  await expect(page.locator(".story-status").nth(0)).toContainText("Loaded biwakososui.gpx");
  await expect(page.locator(".story-status").nth(1)).toContainText("Loaded IMG_2889.JPG");
  await expect(page.locator(".story-status").nth(2)).toContainText("Loaded IMG_2892.JPG");
  await expect(page.locator(".story-card").nth(2)).toHaveAttribute("data-tilia-gpx-url", "./img-2892-helper.gpx");

  await expect(page.locator(".story-status").nth(2)).toContainText("gpx-time-inference");
  expect(pageErrors).toEqual([]);
});