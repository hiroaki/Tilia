import { expect, test } from "@playwright/test";

const data = {
  name: "Visual regression",
  tracks: [
    { name: "First", segments: [{ points: [
      { lat: 35.68, lon: 139.75, elevation: 100 },
      { lat: 35.685, lon: 139.76, elevation: 180 },
      { lat: 35.69, lon: 139.77, elevation: 120 },
    ] }] },
    { name: "Second", segments: [{ points: [
      { lat: 35.70, lon: 139.75, elevation: 130 },
      { lat: 35.71, lon: 139.77, elevation: 200 },
      { lat: 35.72, lon: 139.78, elevation: 160 },
    ] }] },
  ],
};

async function fixture(page, options) {
  await page.route("**/tiles/**", route => route.abort());
  await page.goto("/tests/fixtures/application-lifecycle.html");
  await page.waitForFunction(() => window.fixtureReady);
  await page.evaluate(async options => {
    document.getElementById("sentinel").hidden = true;
    document.body.style.margin = "0";
    Object.assign(window.lifecycle.container.style, { width: "100vw", height: "100vh" });
    const app = window.lifecycle.create(options);
    await app.ready;
  }, options);
  await stylesReady(page);
}
async function stylesReady(page) {
  await page.waitForFunction(() => [...document.querySelectorAll("link[data-tilia-stylesheet]")].every(link => link.sheet));
}
async function glyph(page, index) {
  return page.locator(".tilia-elevation-chart").evaluate((chart, index) => {
    // Read actual painted polyline endpoints, rather than recomputing layout.
    const endpoints = [...chart.querySelectorAll("polyline")].flatMap(line => [...line.points].map(p => [p.x, p.y]));
    const points = [...new Map(endpoints.map(p => [p.join(","), p])).values()];
    const point = chart.createSVGPoint();
    [point.x, point.y] = points[index];
    const screen = point.matrixTransform(chart.getScreenCTM());
    return { x: screen.x, y: screen.y };
  }, index);
}
async function guideError(page, expected) {
  return page.locator(".tilia-elevation-guide-marker").evaluate((node, expected) => {
    const box = node.getBoundingClientRect();
    const line = node.parentElement.querySelector(".tilia-elevation-guide-line").getBoundingClientRect();
    return Math.max(Math.abs(box.x + box.width / 2 - expected.x), Math.abs(box.y + box.height / 2 - expected.y), Math.abs(line.x + line.width / 2 - expected.x));
  }, expected);
}

for (const canvas of [false, true]) {
  test(`elevation geometry, hover and semantic click agree after resize (${canvas ? "Canvas" : "SVG"})`, async ({ page }, testInfo) => {
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    await fixture(page, { baseMapOptions: { tileUrl: "/tiles/{z}/{x}/{y}.png", mapOptions: { preferCanvas: canvas } },
      plugins: ["tilia-gpx-domain", "tilia-gpx-renderer", "tilia-elevation", "tilia-map-selection-presenter"] });
    const locators = await page.evaluate(async data => {
      const app = window.lifecycle.app;
      const entry = await app.domains.gpx.create(data);
      const profiles = app.domains.gpx.getElevationProfile(entry.id).profiles;
      return profiles.flatMap(profile => profile.samples.filter(sample => Number.isFinite(sample.elevation)).map(sample => sample.locator));
    }, data);
    await page.getByRole("button", { name: "Elevation", exact: true }).click();
    await expect(page.locator(".tilia-elevation-chart")).toHaveAttribute("preserveAspectRatio", "none");
    for (const viewport of [{ width: 1280, height: 800 }, { width: 960, height: 768 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      for (const index of [0, 1, 2, 3, 4, 5]) {
        const point = await glyph(page, index);
        await page.mouse.move(point.x, point.y);
        await expect(page.locator(".tilia-elevation-guide-marker")).toBeVisible();
        await expect.poll(() => guideError(page, point)).toBeLessThan(1);
        await page.mouse.click(point.x, point.y);
        await expect.poll(() => page.evaluate(() => window.lifecycle.app.selection.getCurrent().ref)).toMatchObject(locators[index]);
        await expect.poll(async () => guideError(page, await glyph(page, index))).toBeLessThan(1);
      }
      await page.screenshot({ path: testInfo.outputPath(`elevation-${viewport.width}.png`) });
    }
    await page.locator(".tilia-elevation-chart").focus();
    await page.keyboard.press("ArrowRight"); await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(() => window.lifecycle.app.selection.getCurrent().ref)).toMatchObject(locators[1]);
    expect(errors).toEqual([]);
    await page.evaluate(() => window.lifecycle.app.destroy());
    await expect(page.locator("link[data-tilia-stylesheet]")).toHaveCount(0);
  });
}

test("common styles survive optional File disposal; default ranks and explicit rank overrides remain ordered", async ({ page }) => {
  await fixture(page, { plugins: ["tilia-elevation", "tilia-file-import", "tilia-layers", "tilia-settings", "tilia-url-import"] });
  const order = () => page.locator(".tilia-toolbar-item").evaluateAll(nodes => nodes.map(n => n.getAttribute("aria-label")));
  const box = () => page.getByRole("button", { name: "Layers", exact: true }).evaluate(n => ({ width: n.getBoundingClientRect().width, height: n.getBoundingClientRect().height }));
  expect(await order()).toEqual(["Layers", "Elevation", "Open files", "Load URL", "Settings"]);
  expect(await box()).toEqual({ width: 40, height: 40 });
  await page.evaluate(() => window.lifecycle.app.unuse("tilia-file-import"));
  await expect(page.locator('link[data-tilia-stylesheet="tilia-file-input-ui"]')).toHaveCount(0);
  expect(await box()).toEqual({ width: 40, height: 40 });
  await page.evaluate(async () => {
    await window.lifecycle.app.use("tilia-file-import", { rank: -10 });
    await window.lifecycle.app.unuse("tilia-settings");
    await window.lifecycle.app.use("tilia-settings", { rank: 0 });
  });
  await stylesReady(page);
  expect(await order()).toEqual(["Open files", "Settings", "Layers", "Elevation", "Load URL"]);
  await page.evaluate(() => window.lifecycle.app.destroy());
  await expect(page.locator("link[data-tilia-stylesheet]")).toHaveCount(0);
});

test("Route without Panel and Status without Layers own their styling and release it on disposal", async ({ page }, testInfo) => {
  await fixture(page, { plugins: ["x-route-search", "tilia-status"] });
  await expect(page.locator('link[data-tilia-stylesheet="tilia-panel-ui"],link[data-tilia-stylesheet="tilia-layers-ui"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Route search", exact: true }).click();
  expect(await page.getByRole("button", { name: "Close", exact: true }).evaluate(n => getComputedStyle(n).borderRadius)).toBe("999px");
  expect(await page.locator(".tilia-status-text").evaluate(n => ({ font: getComputedStyle(n).fontSize, color: getComputedStyle(n).color }))).toEqual({ font: "12px", color: "rgb(87, 83, 78)" });
  await page.getByRole("button", { name: "Car", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("route-without-panel.png") });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.evaluate(async () => { await window.lifecycle.app.unuse("x-route-search"); await window.lifecycle.app.unuse("tilia-status"); });
  await expect(page.locator('link[data-tilia-stylesheet="x-route-search"],link[data-tilia-stylesheet="tilia-status-ui"]')).toHaveCount(0);
  await expect(page.locator('link[data-tilia-stylesheet="tilia-core-ui"]')).toHaveCount(1);
  await page.evaluate(() => window.lifecycle.app.destroy());
  await expect(page.locator("link[data-tilia-stylesheet]")).toHaveCount(0);
});

test("semantic elevation remains usable without a renderer", async ({ page }) => {
  await fixture(page, { plugins: ["tilia-elevation"] });
  await page.evaluate(async data => { await window.lifecycle.app.domains.gpx.create(data); }, data);
  await page.getByRole("button", { name: "Elevation", exact: true }).click();
  const point = await glyph(page, 4);
  await page.mouse.move(point.x, point.y); await page.mouse.click(point.x, point.y);
  await expect.poll(() => page.evaluate(() => window.lifecycle.app.selection.getCurrent().ref)).toMatchObject({ kind: "track-point", trackIndex: 1, segmentIndex: 0, pointIndex: 1 });
  await expect(page.locator(".leaflet-popup")).toHaveCount(0);
  await page.evaluate(() => window.lifecycle.app.destroy());
});

test("missing elevation runs retain visible isolated samples and canonical selection", async ({ page }, testInfo) => {
  await fixture(page, { plugins: ["tilia-elevation"] });
  await page.evaluate(async () => {
    await window.lifecycle.app.domains.gpx.create({ name: "Isolated samples", tracks: [{ segments: [{ points: [
      { lat: 35, lon: 135, elevation: 100 },
      { lat: 35.01, lon: 135.01 },
      { lat: 35.02, lon: 135.02, elevation: 150 },
    ] }] }] });
  });
  await page.getByRole("button", { name: "Elevation", exact: true }).click();
  await expect(page.locator(".tilia-elevation-chart polyline")).toHaveCount(0);
  await expect(page.locator(".tilia-elevation-chart path")).toHaveCount(2);
  const point = await page.locator(".tilia-elevation-chart path").nth(1).evaluate(path => {
    const start = path.getPointAtLength(0), screen = start.matrixTransform(path.getScreenCTM());
    return { x: screen.x, y: screen.y };
  });
  await page.mouse.move(point.x, point.y);
  await expect.poll(() => guideError(page, point)).toBeLessThan(1);
  await page.mouse.click(point.x, point.y);
  await expect.poll(() => page.evaluate(() => window.lifecycle.app.selection.getCurrent().ref)).toMatchObject({ kind: "track-point", trackIndex: 0, segmentIndex: 0, pointIndex: 2 });
  await page.screenshot({ path: testInfo.outputPath("isolated-elevation.png") });
  await page.evaluate(() => window.lifecycle.app.destroy());
});

test("Photo thumbnail dimensions, long Layers scrolling and shared GPX leases survive renderer disposal", async ({ page }, testInfo) => {
  await fixture(page, { plugins: ["tilia-gpx-domain", "tilia-gpx-renderer", "tilia-gpx-ui", "tilia-photo-ui", "tilia-jpeg-input", "tilia-layers"] });
  await page.evaluate(async data => {
    const app = window.lifecycle.app;
    const image = await fetch("/samples/embed/IMG_2892.JPG").then(r => r.blob());
    await app.load(new File([image], "photo.jpg", { type: "image/jpeg" }));
    for (let i = 0; i < 15; i++) await app.domains.gpx.create({ ...data, name: `Track ${i}` });
  }, data);
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const thumbnail = page.locator(".tilia-layer-thumbnail");
    expect(await thumbnail.evaluate(n => ({ width: n.getBoundingClientRect().width, height: n.getBoundingClientRect().height, fit: getComputedStyle(n).objectFit }))).toEqual({ width: width > 640 ? 72 : 56, height: width > 640 ? 72 : 56, fit: "cover" });
    expect(await page.locator(".tilia-layer-list").evaluate(n => n.scrollHeight > n.clientHeight)).toBe(true);
    await page.getByRole("button", { name: "Track 14", exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Track 14", exact: true })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`layers-scrolled-${width}.png`) });
  }
  await page.evaluate(() => window.lifecycle.app.unuse("tilia-gpx-renderer"));
  await expect(page.locator('link[data-tilia-stylesheet="tilia-gpx"]')).toHaveCount(1);
  await expect(page.locator(".tilia-gpx-tree")).toHaveCount(15);
  await page.evaluate(() => window.lifecycle.app.unuse("tilia-gpx-ui"));
  await expect(page.locator('link[data-tilia-stylesheet="tilia-gpx"]')).toHaveCount(0);
  await page.evaluate(() => window.lifecycle.app.destroy());
  await expect(page.locator("link[data-tilia-stylesheet]")).toHaveCount(0);
});
