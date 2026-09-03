import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const sampleTrackPath = resolve(import.meta.dirname, "../fixtures/sample-track.gpx");
const multiTrackPath = resolve(import.meta.dirname, "../fixtures/multi-track-elevation.gpx");

test("viewer elevation panel renders a profile for an imported GPX track", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/samples/viewer/");

  await page.locator('.tilia-file-import-control input[type="file"]').setInputFiles(sampleTrackPath);
  await expect(page.locator(".tilia-status-text")).toContainText("sample-track.gpx");

  await page.getByRole("button", { name: "Elevation" }).click();
  await expect(page.locator(".tilia-side-panel:not(.tilia-side-panel-hidden)")).toBeVisible();
  await expect(page.locator(".tilia-side-panel-title")).toHaveText("Elevation");
  await expect(page.locator(".tilia-side-panel")).toHaveClass(/tilia-side-panel-layout-bottom/);
  await expect(page.locator(".tilia-elevation-chart")).toBeVisible();
  await expect(page.locator(".tilia-elevation-chart")).toHaveAttribute("aria-label", "Elevation profile");
  await expect(page.locator(".tilia-status-text")).toContainText("Selected sample-track.gpx elevation profile");

  const bottomPanelBox = await page.locator(".tilia-side-panel:not(.tilia-side-panel-hidden)").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  });
  const statusControlBox = await page.locator(".tilia-status-control").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  });
  expect(statusControlBox.bottom).toBeLessThanOrEqual(bottomPanelBox.top);

  expect(pageErrors).toEqual([]);
});

test("viewer elevation panel separates logical tracks and keeps hover and click interactions", async ({ page }) => {
  await page.goto("/samples/viewer/");
  await page.locator('.tilia-file-import-control input[type="file"]').setInputFiles(multiTrackPath);
  await page.getByRole("button", { name: "Elevation" }).click();

  const chart = page.locator(".tilia-elevation-chart");
  const paths = chart.locator("polyline[data-track-index]");
  await expect(paths).toHaveCount(2);

  const xSpans = await paths.evaluateAll((elements) => elements.map((element) => {
    const coordinates = element.getAttribute("points").trim().split(" ").map((pair) => Number(pair.split(",")[0]));
    return Math.max(...coordinates) - Math.min(...coordinates);
  }));
  expect(xSpans[1]).toBeGreaterThan(xSpans[0]);

  const chartBox = await chart.boundingBox();
  expect(chartBox).not.toBeNull();
  await chart.hover({ position: { x: chartBox.width * 0.2, y: chartBox.height * 0.5 } });
  await expect(page.locator(".tilia-elevation-guide-overlay")).toBeVisible();
  await expect(page.locator(".tilia-elevation-guide-marker")).toBeVisible();

  await chart.click({ position: { x: chartBox.width * 0.75, y: chartBox.height * 0.5 } });
  await expect(page.locator(".tilia-status-text")).toContainText("Selected multi-track-elevation.gpx point at");
});

test("map clicks select canonical points from each logical track", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/samples/viewer/");
  await page.locator('.tilia-file-import-control input[type="file"]').setInputFiles(multiTrackPath);

  const trackPaths = page.locator(".leaflet-overlay-pane path.leaflet-interactive");
  await expect(trackPaths).toHaveCount(2);
  // Keep fixture tracks nearby and substantial: Leaflet path clicks become flaky when fitBounds reduces a path to a few pixels.
  await trackPaths.nth(0).click();
  await expect(page.locator(".leaflet-popup")).toBeVisible();
  await expect(page.locator(".leaflet-popup")).toContainText("trkpt");

  await page.goto("/samples/viewer/");
  await page.locator('.tilia-file-import-control input[type="file"]').setInputFiles(multiTrackPath);
  const reloadedTrackPaths = page.locator(".leaflet-overlay-pane path.leaflet-interactive");
  await expect(reloadedTrackPaths).toHaveCount(2);
  await reloadedTrackPaths.nth(1).click();
  await expect(page.locator(".leaflet-popup")).toBeVisible();
  expect(pageErrors).toEqual([]);
});