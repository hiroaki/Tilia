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
