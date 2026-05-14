import { expect, test } from "@playwright/test";

test("viewer base-map selector switches the active base layer", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/samples/viewer/");

  const selector = page.locator(".tilia-base-map-control .tilia-base-map-select");
  await expect(selector).toBeVisible();

  const optionLabels = await selector.locator("option").evaluateAll((nodes) =>
    nodes.map((node) => node.textContent),
  );
  expect(optionLabels).toEqual(["OpenStreetMap", "GSI Standard", "GSI Pale", "OpenTopoMap"]);
  const groupLabels = await selector.locator("optgroup").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("label")),
  );
  expect(groupLabels).toEqual(["GSI"]);
  await expect(selector).toHaveValue("osm");

  await selector.selectOption("opentopomap");

  await expect(selector).toHaveValue("opentopomap");
  await expect(page.locator(".tilia-status-text")).toContainText("Base map changed to OpenTopoMap");
  expect(pageErrors).toEqual([]);
});