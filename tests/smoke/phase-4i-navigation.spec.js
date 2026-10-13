import { expect, test } from "@playwright/test";

test("explicit Fit/Reveal uses semantic targets on real Leaflet without renderers", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/tests/fixtures/phase-4h/");
  await expect(page.locator("body")).toHaveAttribute("data-phase4h-ready", "true");
  const ids = await page.evaluate(async () => {
    const { app, map } = window.phase4h;
    await app.unuse("tilia-gpx-renderer"); await app.unuse("tilia-photo-renderer");
    const gpx = await app.domains.gpx.create({ name: "navigation.gpx", tracks: [{ name: "A", segments: [
      { points: [{ lat: 1, lon: 10 }, { lat: 2, lon: 20 }] }, { points: [{ lat: 3, lon: 30 }] },
    ] }], waypoints: [{ name: "W", lat: 7, lon: 70 }] });
    const photo = await app.domains.photo.create({ data: { name: "photo.jpg", coordinate: { lat: 35, lon: 135 } }, blob: new Blob(["photo"]) });
    await app.entries.setVisible(gpx.id, false); await app.entries.setVisible(photo.id, false);
    window.navigationCalls = { fits: [], pans: [] };
    const fit = map.fitBounds, pan = map.panTo;
    map.fitBounds = function (bounds, options) { window.navigationCalls.fits.push({ bounds, options }); return fit.call(this, bounds, { ...options, animate: false }); };
    map.panTo = function (point, options) { window.navigationCalls.pans.push(point); return pan.call(this, point, { ...options, animate: false }); };
    return { gpx: gpx.id, photo: photo.id };
  });
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page.getByRole("button", { name: "Fit A", exact: true }).click();
  expect(await page.evaluate(() => window.navigationCalls.fits.at(-1))).toEqual({ bounds: [[1, 10], [3, 30]], options: { padding: [20, 20], maxZoom: 18 } });
  await page.getByRole("button", { name: "Reveal W", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.phase4h.app.selection.getCurrent())).toMatchObject({ entryId: ids.gpx, ref: { kind: "waypoint", waypointIndex: 0 } });
  await expect.poll(() => page.evaluate(() => window.navigationCalls.pans.at(-1))).toEqual({ lat: 7, lng: 70 });
  await page.getByRole("button", { name: "Fit photo.jpg", exact: true }).click();
  expect(await page.evaluate(() => window.navigationCalls.fits.at(-1))).toEqual({ bounds: [[35, 135], [35, 135]], options: { padding: [20, 20], maxZoom: 18 } });
  await page.getByRole("button", { name: "Reveal photo.jpg", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.phase4h.app.selection.getCurrent())).toMatchObject({ entryId: ids.photo, ref: { kind: "photo" } });
  await expect.poll(() => page.evaluate(() => window.navigationCalls.pans.at(-1))).toEqual({ lat: 35, lng: 135 });
  await page.getByRole("button", { name: "A", exact: true }).dblclick();
  await expect.poll(() => page.evaluate(() => window.navigationCalls.fits.length)).toBe(3);
  expect(await page.evaluate(() => window.navigationCalls.fits.at(-1).bounds)).toEqual([[1, 10], [3, 30]]);
  expect(await page.evaluate(() => window.phase4h.app.entries.list().map(entry => entry.visible))).toEqual([false, false]);
  expect(errors).toEqual([]);
});
