import { expect, test } from "@playwright/test";

test("embed sample boots repeated maps and loads its sample assets", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/samples/embed/");

  await expect(page.locator(".story-map.leaflet-container")).toHaveCount(3);
  await expect(page.locator(".story-status").nth(0)).toContainText("Loaded biwakososui.gpx");
  await expect(page.locator(".story-status").nth(1)).toContainText("Loaded IMG_2889.JPG");
  await expect(page.locator(".story-status").nth(2)).toContainText("Loaded IMG_2892.JPG");
  await expect(page.locator(".story-card").nth(2)).toHaveAttribute("data-tilia-gpx-url", "./biwakososui.gpx");
  await expect(page.locator(".story-card").nth(2)).toHaveAttribute("data-tilia-photo-time-mode", "jst");

  expect(pageErrors).toEqual([]);
});