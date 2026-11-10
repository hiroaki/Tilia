import { expect, test } from "@playwright/test";

for (const timezoneId of ["Asia/Tokyo", "UTC", "America/New_York"]) {
  test.describe(`fixed offset in ${timezoneId}`, () => {
    test.use({ timezoneId });
    test("real Embed JPEG matches its original GPX with +09:00", async ({ page }, testInfo) => {
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      await page.goto("/samples/embed/");
      const card = page.locator(".story-card").filter({ has: page.locator('img[data-tilia-photo-url="./IMG_2892.JPG"]') });
      await expect(card.locator('[data-photo-meta="name"]')).toHaveText("IMG_2892.JPG");
      await expect(card.locator('[data-photo-meta="locationSource"]')).toHaveText("gpx-time-inference");
      await card.locator(".leaflet-marker-icon").click();
      await expect(card.locator(".tilia-popup")).toContainText("34.995338");
      await expect(card.locator(".tilia-popup")).toContainText("135.815870");
      await card.screenshot({ path: testInfo.outputPath("embed-fixed-offset.png") });
      expect(errors).toEqual([]);
    });
  });
}
