import { expect, test } from "@playwright/test";

test("experimental sample: interpolated anchors, zoom consistency, selection, visibility and disposal", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("https://**/*", route => route.abort());
  await page.goto("/samples/distance-markers/");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  const labels = page.locator(".x-distance-marker");
  await expect(labels).toHaveCount(0);
  await expect(page.locator("#marker-count")).toHaveText("0");
  await expect(page.locator("#zoom-level")).toHaveText("13");
  expect(await page.evaluate(() => window.distanceMarkersDemo.app.selection.getCurrent())).toBeNull();
  await page.getByRole("button", { name: "Sparse track + segment gap" }).click();
  await expect.poll(() => labels.count()).toBeGreaterThan(0);
  for (const kind of ["track", "segment"]) {
    await page.evaluate(async kind => {
      const { app, entryId } = window.distanceMarkersDemo;
      const target = kind === "track" ? { kind, trackIndex: 0 } : { kind, trackIndex: 0, segmentIndex: 0 };
      await app.selection.request(app.domains.gpx.selection.createCandidate(entryId, target));
    }, kind);
    const highlight = page.locator('[data-tilia-map-band="selection"] svg path').first();
    await expect(highlight).toBeVisible();
    const paneZ = locator => locator.evaluate(el => Number(getComputedStyle(el.closest(".leaflet-pane")).zIndex));
    expect(await paneZ(labels.first())).toBeGreaterThan(await paneZ(highlight));
  }
  const inspect = () => page.evaluate(() => {
    const points = [];
    window.distanceMarkersDemo.app.map.eachLayer(layer => {
      if (layer.options.icon?.options.className === "x-distance-marker") points.push({
        label: layer.options.icon.options.html, point: layer.getLatLng(), interactive: layer.options.interactive,
      });
    });
    return points;
  });
  const spacing = page.getByLabel("Marker spacing");
  await spacing.selectOption("small");
  await expect(spacing).toBeEnabled();
  const dense = await labels.count();
  await spacing.selectOption("large");
  await expect(spacing).toBeEnabled();
  await expect.poll(() => labels.count()).toBeLessThan(dense);
  const markerLimit = page.getByLabel("Candidate limit");
  await expect(markerLimit).toHaveValue("100");
  const beforeLimitChange = await inspect();
  await markerLimit.selectOption("300");
  await expect(markerLimit).toBeEnabled();
  await expect(spacing).toHaveValue("large");
  expect(await inspect()).toEqual(beforeLimitChange); // The short sample is limited by density.

  await spacing.selectOption("medium");
  await expect(spacing).toBeEnabled();
  await expect(markerLimit).toHaveValue("300");
  const initial = await inspect();
  await expect(page.locator("#marker-count")).toHaveText(String(initial.length));
  expect(await labels.allTextContents()).toEqual(initial.map(p => p.label.match(/>(\d+ (?:m|km))</)?.[1]));
  expect(initial.length).toBeLessThanOrEqual(100);
  expect(initial.every(p => !p.interactive)).toBe(true);
  await page.evaluate(() => {
    const map = window.distanceMarkersDemo.app.map;
    map.setZoom(map.getZoom() + 1, { animate: false });
  });
  await expect.poll(() => page.locator("#zoom-level").textContent()).toBe(String(
    await page.evaluate(() => window.distanceMarkersDemo.app.map.getZoom()),
  ));
  const zoomed = await inspect();
  const common = initial.filter(p => zoomed.some(q => q.label === p.label));
  expect(common.length).toBeGreaterThan(0);
  for (const p of common) expect(zoomed.find(q => q.label === p.label).point).toEqual(p.point);
  await page.getByRole("button", { name: "Tight loop", exact: true }).click();
  await expect.poll(() => labels.count()).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Distant points (stress case)", exact: true }).click();
  await expect.poll(() => labels.count()).toBeGreaterThan(0);
  expect(await labels.count()).toBeLessThanOrEqual(100);
  await page.evaluate(async () => {
    const { app, entryId } = window.distanceMarkersDemo;
    await app.entries.setVisible(entryId, false);
  });
  await expect(labels).toHaveCount(0);
  await page.evaluate(async () => {
    const { app, entryId } = window.distanceMarkersDemo;
    await app.entries.setVisible(entryId, true);
  });
  await expect.poll(() => labels.count()).toBeGreaterThan(0);
  await page.evaluate(() => window.distanceMarkersDemo.app.selection.clear());
  await expect(labels).toHaveCount(0);
  await page.evaluate(() => window.distanceMarkersDemo.selectTrack(0));
  await expect.poll(() => labels.count()).toBeGreaterThan(0);
  await page.evaluate(() => window.distanceMarkersDemo.app.unuse("x-distance-markers"));
  await expect(labels).toHaveCount(0);
  expect(errors).toEqual([]);
});
