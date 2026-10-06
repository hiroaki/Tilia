import { expect, test } from "@playwright/test";

test("Phase 4B shell boots with the intentionally empty plugin allowlist", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/samples/phase-4b/");
  await expect(page.locator("#map.leaflet-container")).toBeVisible();
  await expect(page.locator("#phase-4b-status")).toHaveText("0 plugins active");
  expect(pageErrors).toEqual([]);
});
