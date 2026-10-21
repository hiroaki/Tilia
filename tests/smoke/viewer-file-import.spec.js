import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const sampleTrackPath = resolve(import.meta.dirname, "../fixtures/sample-track.gpx");
const sampleRoutePath = resolve(import.meta.dirname, "../fixtures/sample-route.gpx");

test("viewer sample imports a GPX file and reflects it in the layers panel", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/samples/viewer/");

  await page.locator('.tilia-file-import-control input[type="file"]').setInputFiles(sampleTrackPath);

  await expect(page.locator(".tilia-status-text")).toContainText("Loaded 1 file(s) from file.");
  await expect(page.locator(".tilia-status-text")).toContainText("sample-track.gpx");

  await page.getByRole("button", { name: "Layers" }).click();
  await expect(page.locator(".tilia-side-panel:not(.tilia-side-panel-hidden)")).toBeVisible();
  await expect(page.locator(".tilia-layer-name")).toContainText("sample-track.gpx");
  await expect(page.locator(".tilia-layer-meta")).toContainText("1 waypoint / 1 track");

  await page.getByRole("button", { name: "Delete all" }).click();
  await expect(page.locator(".tilia-layer-empty")).toContainText("No layers");
  await expect(page.locator(".tilia-status-text")).toContainText("Cleared all layers and sources");

  expect(pageErrors).toEqual([]);
});

test("clicking a GPX route-point marker opens its popup", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/samples/viewer/");
  await page.locator('.tilia-file-import-control input[type="file"]').setInputFiles(sampleRoutePath);

  const routePointMarker = page.locator(".tilia-route-point-marker").first();
  await expect(routePointMarker).toBeVisible();
  await routePointMarker.click();

  const popup = page.locator(".leaflet-popup");
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("sample-route.gpx");
  await expect(popup).toContainText("Route point");
  await expect(popup).toContainText("Scenic route");
  await expect(popup).toContainText("Route start");
  expect(pageErrors).toEqual([]);
});
