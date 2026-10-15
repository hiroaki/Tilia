import { expect, test } from "@playwright/test";

async function open(page, value, extra = []) {
  await page.route("**/tiles/**", (route) => route.abort());
  await page.goto(`/tests/fixtures/application-lifecycle.html?tilia.c=${encodeURIComponent(value)}${extra.includes("tilia-query-import") ? "&gpx=" + encodeURIComponent("http://127.0.0.1:4173/initial-view.gpx") : ""}`);
  await page.waitForFunction(() => window.fixtureReady);
  await page.evaluate(async (plugins) => {
    const app = window.lifecycle.create({ plugins: ["tilia-status", "tilia-initial-view", ...plugins, { plugin: {
      id: "x-view-observer", setup(c) { window.viewMap = c.map.advancedLeafletMap(); },
    } }] });
    await app.ready;
  }, extra);
}
async function deferredLocation(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      getCurrentPosition(success, failure) { window.locationCallbacks = { success, failure }; },
    } });
  });
}

test("explicit view uses Leaflet 2 without requesting geolocation", async ({ page }) => {
  await page.addInitScript(() => { window.geoCalls = 0; Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition() { window.geoCalls++; } } }); });
  await open(page, "35,139,12");
  expect(await page.evaluate(() => ({ lat: window.viewMap.getCenter().lat, lng: window.viewMap.getCenter().lng, zoom: window.viewMap.getZoom(), geoCalls: window.geoCalls })))
    .toEqual({ lat: 35, lng: 139, zoom: 12, geoCalls: 0 });
  await expect(page.locator(".tilia-status-text")).toHaveText("Ready");
});

test("browser geolocation succeeds with granted permission", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]); await context.setGeolocation({ latitude: 35, longitude: 139 });
  await open(page, "locate,12");
  await expect(page.locator(".tilia-status-text")).toHaveText("Current location obtained.");
  expect(await page.evaluate(() => [window.viewMap.getCenter().lat, window.viewMap.getCenter().lng, window.viewMap.getZoom()])).toEqual([35, 139, 12]);
});

test("user input discards a delayed location and stops pending status", async ({ page }) => {
  await deferredLocation(page); await open(page, "locate,12");
  await expect(page.locator(".tilia-status-text")).toHaveText("Obtaining current location…");
  await page.locator("#map").click({ position: { x: 450, y: 300 } });
  await page.evaluate(() => window.locationCallbacks.success({ coords: { latitude: 1, longitude: 2 } }));
  await expect(page.locator(".tilia-status-text")).toHaveText("Applying current location was canceled.");
  expect(await page.evaluate(() => window.viewMap.getZoom())).toBe(13);
});

test("query GPX auto-fit wins over delayed location", async ({ page }) => {
  await deferredLocation(page);
  await page.route("**/initial-view.gpx", (route) => route.fulfill({ contentType: "application/gpx+xml", body: '<?xml version="1.0"?><gpx version="1.1" creator="test"><trk><name>Test</name><trkseg><trkpt lat="40" lon="10"/><trkpt lat="41" lon="11"/></trkseg></trk></gpx>' }));
  await open(page, "locate,12", ["tilia-query-import", "tilia-gpx-input"]);
  await expect.poll(() => page.evaluate(() => window.lifecycle.app.entries.list().length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.viewMap.getCenter().lat)).toBeGreaterThan(39);
  const before = await page.evaluate(() => [window.viewMap.getCenter().lat, window.viewMap.getCenter().lng, window.viewMap.getZoom()]);
  await page.evaluate(() => window.locationCallbacks.success({ coords: { latitude: 1, longitude: 2 } }));
  expect(await page.evaluate(() => [window.viewMap.getCenter().lat, window.viewMap.getCenter().lng, window.viewMap.getZoom()])).toEqual(before);
});
