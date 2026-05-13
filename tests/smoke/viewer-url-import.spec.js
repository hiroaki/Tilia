import { expect, test } from "@playwright/test";

test("viewer sample loads a GPX file through the URL import control", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/samples/viewer/");

  await page.getByRole("button", { name: "Load URL" }).click();
  await page.locator(".tilia-url-input").fill(new URL("/tests/fixtures/sample-track.gpx", page.url()).href);
  await page.getByRole("button", { name: "Load", exact: true }).click();

  await expect(page.locator(".tilia-status-text")).toContainText("Loaded 1 file(s) from url.");
  await expect(page.locator(".tilia-status-text")).toContainText("sample-track.gpx");

  await page.getByRole("button", { name: "Layers" }).click();
  await expect(page.locator(".tilia-layer-name")).toContainText("sample-track.gpx");

  expect(pageErrors).toEqual([]);
});