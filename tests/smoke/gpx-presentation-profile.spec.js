import { expect, test } from "@playwright/test";

test("recorded elevation geometry and map/chart point selection stay aligned across mode changes", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/tests/fixtures/phase-4h/");
  await expect(page.locator("body")).toHaveAttribute("data-phase4h-ready", "true");
  const expected = await page.evaluate(async () => {
    const { app, map } = window.phase4h;
    await app.use("tilia-elevation");
    map.setView([35, 135.01], 15, { animate: false });
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
  await expect(chart.locator(".tilia-elevation-track-divider")).toHaveCount(0);
  await expect(chart.locator("polyline")).toHaveCount(3);
  await expect(chart.locator('polyline[stroke-dasharray="4 3"]')).toHaveCount(1);
  // Use the painted solid endpoints, in canonical traversal order. The dashed
  // stroke spanning the gap exists only in Track mode.
  const solidVertices = () => chart.locator('polyline[stroke-dasharray="none"]').evaluateAll(lines =>
    lines.map(line => [...line.points].map(point => [point.x, point.y])));
  const trackVertices = await solidVertices();
  expect(trackVertices).toHaveLength(2);
  const [left, right] = [trackVertices[0][1], trackVertices[1][0]];
  expect(right[0]).toBeGreaterThan(left[0]);

  const screenPoint = point => chart.evaluate((svg, [x, y]) => {
    const screen = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
    return { x: screen.x, y: screen.y };
  }, point);
  const guide = page.locator(".tilia-elevation-guide-marker");
  const guideLine = page.locator(".tilia-elevation-guide-line");
  async function expectGuide(vertex) {
    await expect(guide).toBeVisible();
    await expect(guideLine).toBeVisible();
    const screen = await screenPoint(vertex);
    const line = await guideLine.boundingBox();
    expect(Math.abs(line.x + line.width / 2 - screen.x)).toBeLessThan(1);
    await expect.poll(async () => {
      const box = await guide.boundingBox();
      return box ? Math.hypot(box.x + box.width / 2 - screen.x, box.y + box.height / 2 - screen.y) : Infinity;
    }).toBeLessThan(1);
  }
  const selected = () => page.evaluate(() => window.phase4h.app.selection.getCurrent()?.ref);
  async function expectBoundary(segmentIndex) {
    const pointIndex = segmentIndex === 0 ? 1 : 0;
    const ref = { kind: "track-point", trackIndex: 0, segmentIndex, pointIndex };
    await expect.poll(selected).toMatchObject(ref);
    await expectGuide(segmentIndex === 0 ? left : right);
    // The chart selects a real map point. Inspect the actual crosshair layer
    // and popup, independent of the coordinates reported by the chart.
    await expect.poll(() => page.evaluate(() => {
      let coordinate;
      window.phase4h.map.eachLayer(layer => {
        if (layer.options.icon?.options.className === "tilia-selection-crosshair") {
          const { lat, lng } = layer.getLatLng();
          coordinate = [lat, lng];
        }
      });
      return coordinate;
    })).toEqual([35, segmentIndex === 0 ? 135.001 : 135.02]);
    await expect(page.locator(".leaflet-popup")).toContainText("Track point");
  }

  await chart.focus();
  await page.evaluate(() => window.phase4h.app.domains.gpx.setPresentationMode("segment"));
  await expect(popupDistance).toHaveText(expected.segment);
  await expect(chart).toBeFocused();
  await expect(chart.locator("polyline")).toHaveCount(2);
  await expect(chart.locator('polyline[stroke-dasharray="4 3"]')).toHaveCount(0);
  expect(await solidVertices()).toEqual(trackVertices);
  await expect(page.locator(".tilia-elevation-summary")).toContainText("ascent 13 m");
  await expectBoundary(1);

  // Click recorded Leaflet geometry near the left boundary to drive the chart
  // from the map. The path's screen transform includes the current map view.
  await page.locator(".leaflet-popup-close-button").click();
  const recorded = page.locator('[data-tilia-map-band="geometry"] path.leaflet-interactive[fill="none"]').first();
  const mapPoint = await recorded.evaluate(path => {
    const p = path.getPointAtLength(path.getTotalLength() * 0.85).matrixTransform(path.getScreenCTM());
    return { x: p.x, y: p.y };
  });
  await page.mouse.click(mapPoint.x, mapPoint.y);
  await expectBoundary(0);

  // Click both actual endpoints and both halves of the empty displayed gap.
  // The two contradictory Y coordinates ensure hit testing still uses X.
  for (const [point, segmentIndex] of [
    [right, 1], [left, 0],
    [[left[0] + (right[0] - left[0]) * 0.7, left[1]], 1],
    [[left[0] + (right[0] - left[0]) * 0.3, right[1]], 0],
  ]) {
    const screen = await screenPoint(point);
    await page.mouse.move(screen.x, screen.y);
    await expectGuide(segmentIndex === 0 ? left : right);
    await page.mouse.click(screen.x, screen.y);
    await expectBoundary(segmentIndex);
  }

  await chart.focus();
  for (const segmentIndex of [0, 1]) {
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expectBoundary(segmentIndex);
    await expect(chart).toBeFocused();
  }
  await page.evaluate(() => window.phase4h.app.domains.gpx.setPresentationMode("track"));
  await expect(chart).toBeFocused();
  await page.keyboard.press("Enter");
  await expectBoundary(1);
  await expect(popupDistance).toHaveText(expected.track);
  expect(await page.evaluate(async id => {
    const { serializeGpxSource } = await import("/src/gpx/serialize.js");
    return serializeGpxSource(window.phase4h.app.domains.gpx.getDocument(id).document);
  }, expected.id)).toBe(expected.serialized);
  const visibilityAndSelection = await page.evaluate(async id => {
    const { app } = window.phase4h;
    const chart = document.querySelector(".tilia-elevation-chart");
    const guide = document.querySelector(".tilia-elevation-guide-marker");
    const label = document.querySelector(".tilia-elevation-name");
    const atBreak = guide.style.left;
    const gpx = app.domains.gpx;
    await app.selection.request(gpx.selection.createCandidate(id, { kind: "track-point", trackIndex: 0, segmentIndex: 0, pointIndex: 0 }));
    const guideMoved = !guide.hidden && guide.style.left !== atBreak;
    await app.entries.setVisible(id, false);
    const hiddenLabel = label.textContent;
    await app.entries.setVisible(id, true);
    await app.selection.clear();
    return { guideMoved, hiddenLabel, visibleLabel: label.textContent, guideHidden: guide.hidden,
      sameChart: chart === document.activeElement && chart === document.querySelector(".tilia-elevation-chart") };
  }, expected.id);
  expect(visibilityAndSelection).toEqual({ guideMoved: true, hiddenLabel: "track.gpx (hidden)", visibleLabel: "track.gpx",
    guideHidden: true, sameChart: true });
  expect(errors).toEqual([]);
});

test("a multi-entry mode switch rebuilds the open elevation chart once", async ({ page }, testInfo) => {
  await page.goto("/tests/fixtures/application-lifecycle.html");
  await page.waitForFunction(() => window.fixtureReady);
  await page.evaluate(async () => {
    const app = window.lifecycle.create({ plugins: ["tilia-elevation"] });
    await app.ready;
    const segments = Array.from({ length: 100 }, (_, s) => ({
      points: Array.from({ length: 100 }, (_, p) => ({
        lat: 35 + s / 1000, lon: 135 + p / 10000, elevation: s + p,
      })),
    }));
    const gpx = app.domains.gpx;
    for (const name of ["First", "Displayed", "Third"]) await gpx.create({ name, tracks: [{ segments }] });
    const active = app.entries.list()[1].id;
    await app.selection.request(gpx.selection.createCandidate(active, { kind: "track-point", trackIndex: 0, segmentIndex: 1, pointIndex: 0 }));
  });
  await page.getByRole("button", { name: "Elevation", exact: true }).click();
  await page.locator(".tilia-elevation-chart").focus();
  const runs = await page.evaluate(async () => {
    const app = window.lifecycle.app, container = document.querySelector(".tilia-elevation-panel-content");
    let rebuilds = 0;
    const observer = new MutationObserver(records => {
      for (const record of records) for (const added of record.addedNodes) {
        if (added.classList?.contains("tilia-elevation-chart-wrap")) rebuilds++;
      }
    });
    observer.observe(container, { childList: true });
    const results = [];
    try {
      for (let iteration = 0; iteration < 4; iteration++) {
        for (const mode of ["segment", "track"]) {
          await new Promise(requestAnimationFrame);
          rebuilds = 0;
          const start = performance.now();
          await app.domains.gpx.setPresentationMode(mode);
          const elapsed = performance.now() - start;
          const chart = container.querySelector("svg");
          results.push({ iteration, mode, elapsed, rebuilds, focus: chart === document.activeElement,
            strokes: chart.querySelectorAll("polyline").length });
        }
      }
    } finally { observer.disconnect(); }
    return results;
  });
  await testInfo.attach("elevation-switch-timings", { body: JSON.stringify(runs), contentType: "application/json" });
  for (const run of runs) {
    expect(run.rebuilds).toBe(1);
    expect(run.focus).toBe(true);
    expect(run.strokes).toBe(run.mode === "track" ? 9999 : 9900);
  }
  await page.evaluate(() => window.lifecycle.app.destroy());
});

test("a divider marks only the space between tracks in both modes", async ({ page }) => {
  await page.goto("/tests/fixtures/application-lifecycle.html");
  await page.waitForFunction(() => window.fixtureReady);
  await page.evaluate(async () => {
    const app = window.lifecycle.create({ plugins: ["tilia-elevation"] });
    await app.ready;
    const segment = lon => ({ points: [0, 1].map(i => ({ lat: 35, lon: lon + i, elevation: 100 + i })) });
    await app.domains.gpx.create({ tracks: [
      { segments: [segment(135), segment(138)] }, { segments: [segment(145)] },
    ] });
  });
  await page.getByRole("button", { name: "Elevation", exact: true }).click();
  for (const mode of ["track", "segment"]) {
    await page.evaluate(mode => window.lifecycle.app.domains.gpx.setPresentationMode(mode), mode);
    const chart = page.locator(".tilia-elevation-chart");
    const lines = chart.locator(".tilia-elevation-track-divider");
    await expect(lines).toHaveCount(2);
    const xs = await lines.evaluateAll(nodes => nodes.map(node => node.x1.baseVal.value));
    const ends = await chart.evaluate(svg => [
      [...svg.querySelectorAll('polyline[data-track-index="0"]')].at(-1).points.getItem(1).x,
      svg.querySelector('polyline[data-track-index="1"]').points.getItem(0).x,
    ]);
    expect(xs[0]).toBeGreaterThan(ends[0]);
    expect(xs[1]).toBeGreaterThan(xs[0]);
    expect(xs[1]).toBeLessThan(ends[1]);
    expect((xs[0] + xs[1]) / 2).toBeCloseTo((ends[0] + ends[1]) / 2);
    await expect(lines.first()).toHaveCSS("pointer-events", "none");
  }
  await page.evaluate(() => window.lifecycle.app.destroy());
});
