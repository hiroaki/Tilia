import { expect, test } from "@playwright/test";

test("an open popup and elevation chart follow mode changes and both sides of a break remain keyboard selectable", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/tests/fixtures/phase-4h/");
  await expect(page.locator("body")).toHaveAttribute("data-phase4h-ready", "true");
  const expected = await page.evaluate(async () => {
    const { app, map } = window.phase4h;
    await app.use("tilia-elevation");
    map.setView([35, 135], 11, { animate: false });
    const gpx = app.domains.gpx;
    const entry = await gpx.create({ tracks: [{ segments: [
      { points: [{ lat: 35, lon: 135, elevation: 10 }, { lat: 35, lon: 135.001, elevation: 15 }] },
      { points: [{ lat: 35, lon: 135.02, elevation: 100 }, { lat: 35, lon: 135.021, elevation: 108 }] },
    ] }] });
    const { serializeGpxSource } = await import("/src/gpx/serialize.js");
    const serialized = serializeGpxSource(gpx.getDocument(entry.id).document);
    const samples = gpx.getElevationProfile(entry.id).profiles[0].samples;
    await app.selection.request(gpx.selection.createCandidate(entry.id, samples[2].locator));
    const format = meters => meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
    return { id: entry.id, serialized, track: format(samples[2].distanceMeters), segment: format(samples[1].distanceMeters) };
  });

  const popupDistance = page.locator(".tilia-popup-row").filter({ has: page.getByText("Distance", { exact: true }) }).locator("strong");
  await expect(popupDistance).toHaveText(expected.track);
  await page.getByRole("button", { name: "Elevation", exact: true }).click();
  const chart = page.locator(".tilia-elevation-chart");
  await expect(chart.locator("polyline")).toHaveCount(3);
  await expect(chart.locator('polyline[stroke-dasharray="4 3"]')).toHaveCount(1);
  await chart.focus();
  await page.evaluate(() => window.phase4h.app.domains.gpx.setPresentationMode("segment"));
  await expect(popupDistance).toHaveText(expected.segment);
  await expect(chart).toBeFocused();
  await expect(page.locator(".tilia-elevation-guide-marker")).toBeVisible();
  await expect(chart.locator("polyline")).toHaveCount(2);
  await expect(chart.locator('polyline[stroke-dasharray="4 3"]')).toHaveCount(0);
  await expect(page.locator(".tilia-elevation-summary")).toContainText("ascent 13 m");
  const selected = () => page.evaluate(() => window.phase4h.app.selection.getCurrent().ref);
  await expect.poll(selected).toMatchObject({ segmentIndex: 1, pointIndex: 0 });
  for (const [segmentIndex, pointIndex] of [[0, 1], [1, 0]]) {
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect.poll(selected).toMatchObject({ segmentIndex, pointIndex });
    await expect(chart).toBeFocused();
  }
  expect(await chart.locator("polyline").evaluateAll(lines => lines[0].points.getItem(1).x === lines[1].points.getItem(0).x)).toBe(true);
  expect(await page.evaluate(async id => {
    const { serializeGpxSource } = await import("/src/gpx/serialize.js");
    return serializeGpxSource(window.phase4h.app.domains.gpx.getDocument(id).document);
  }, expected.id)).toBe(expected.serialized);
  expect(errors).toEqual([]);
});
