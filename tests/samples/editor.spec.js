import { expect, test } from "@playwright/test";

test("editor sample loads the track editor control", async ({ page }) => {
  await page.goto("/samples/editor/localhost.html");
  await expect(page.getByRole("button", { name: "Track editor" })).toBeVisible();
});
