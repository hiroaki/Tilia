import { expect, test } from "@playwright/test";

test("viewer settings panel updates the default time mode and re-shows status", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/samples/viewer/");

  await page.locator(".tilia-status-dismiss").click();
  await expect(page.locator(".tilia-status-panel")).toHaveClass(/tilia-status-panel-dismissed/);

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.locator(".tilia-side-panel:not(.tilia-side-panel-hidden)")).toBeVisible();
  await expect(page.locator(".tilia-side-panel-title")).toHaveText("Settings");
  await expect(page.locator(".tilia-default-time-mode-select")).toHaveValue("local");

  await page.locator(".tilia-default-time-mode-select").selectOption("utc");
  await expect(page.locator(".tilia-status-text")).toContainText("Default photo time mode set to UTC");
  await expect(page.locator(".tilia-status-panel")).not.toHaveClass(/tilia-status-panel-dismissed/);

  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.locator(".tilia-side-panel")) .toHaveClass(/tilia-side-panel-hidden/);

  expect(pageErrors).toEqual([]);
});