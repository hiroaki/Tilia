import { expect, test } from "@playwright/test";

async function ready(page, query = "") {
  const startupErrors = [];
  page.on("pageerror", error => startupErrors.push(error.message));
  await page.route("**/tiles/**", route => route.fulfill({
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/hfkAAAAASUVORK5CYII=", "base64"),
  }));
  await page.goto(`/tests/fixtures/street-view.html${query}`);
  try { await expect(page.locator("body")).toHaveAttribute("data-ready", "true"); }
  catch (error) { throw new Error(`${error.message}\nStartup errors: ${startupErrors.join("; ")}`); }
}
async function emptyClick(page, x = 0.7, y = 0.8) {
  const box = await page.locator("#map").boundingBox();
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
}
async function pan(page, dx, dy) {
  const box = await page.locator("#map").boundingBox();
  const x = box.x + 230, y = box.y + 380;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 }); await page.mouse.up();
}
async function indicator(page) {
  return page.evaluate(() => {
    const f = window.streetViewFixture, markers = [];
    f.map.eachLayer(layer => {
      if (layer.options.icon?.options.className === "x-street-view-direction") {
        const p = layer.getLatLng(), svg = layer.getElement().querySelector("svg");
        const anchor = layer.getElement().querySelector("circle").getBoundingClientRect();
        const projected = f.map.latLngToContainerPoint(p), box = f.map.getContainer().getBoundingClientRect();
        markers.push({ coordinate: { lat: p.lat, lng: p.lng }, heading: Number(svg.dataset.heading),
          size: getComputedStyle(svg).width, interactive: layer.options.interactive,
          anchorError: Math.hypot(anchor.x + anchor.width / 2 - box.x - projected.x, anchor.y + anchor.height / 2 - box.y - projected.y) });
      }
    });
    return markers;
  });
}

test("fixed location, real pan heading, panel navigation, alternating clicks and cleanup", async ({ page, context }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await context.route("https://www.google.com/maps/**", route => route.fulfill({ contentType: "text/html", body: "Street View navigation captured" }));
  await ready(page);
  const panel = page.locator(".x-street-view-panel"), arrows = page.locator(".x-street-view-direction");
  await expect(panel).toBeHidden();
  await emptyClick(page); await expect(panel).toBeVisible(); await expect(arrows).toHaveCount(1);
  const initial = (await indicator(page))[0];
  expect(initial.heading).toBe(0); expect(initial.anchorError).toBeLessThan(2);
  const initialPopup = page.waitForEvent("popup");
  await panel.getByRole("button", { name: "Street View", exact: true }).click();
  const initialDestination = await initialPopup;
  await initialDestination.waitForLoadState("domcontentloaded");
  const initialUrl = new URL(initialDestination.url());
  expect(initialUrl.searchParams.get("heading")).toBe("0");
  expect(initialUrl.searchParams.get("viewpoint")).toBe(`${initial.coordinate.lat},${initial.coordinate.lng}`);
  await initialDestination.close();
  await expect(panel).toBeVisible(); await expect(arrows).toHaveCount(1);
  await pan(page, 130, 0); await expect(arrows).toHaveCount(1);
  const first = (await indicator(page))[0];
  expect(first.coordinate).toEqual(initial.coordinate);
  expect(first.heading).toBeCloseTo(270, 0); expect(first.interactive).toBe(false); expect(first.anchorError).toBeLessThan(2);
  await pan(page, 0, -130);
  const second = (await indicator(page))[0];
  expect(second.coordinate).toEqual(first.coordinate); expect(second.heading).toBeCloseTo(180, 0);
  await expect(panel).toBeVisible();
  await page.evaluate(() => window.streetViewFixture.map.setZoom(14, { animate: false }));
  const zoomed = (await indicator(page))[0];
  expect(zoomed.coordinate).toEqual(first.coordinate); expect(zoomed.size).toBe("128px"); expect(zoomed.anchorError).toBeLessThan(2);
  // Recenter programmatically so the selected anchor remains inside the map
  // for the click-through check, without introducing another pan gesture.
  await page.evaluate(point => window.streetViewFixture.map.panTo(point, { animate: false }), first.coordinate);
  expect((await indicator(page))[0].heading).toBeCloseTo(second.heading, 5);
  const popupPromise = page.waitForEvent("popup");
  await panel.getByRole("button", { name: "Street View", exact: true }).click();
  const destination = await popupPromise; await destination.waitForLoadState("domcontentloaded");
  const url = new URL(destination.url());
  expect(url.origin).toBe("https://www.google.com"); expect(url.searchParams.get("map_action")).toBe("pano");
  expect(url.searchParams.get("viewpoint")).toBe(`${first.coordinate.lat},${first.coordinate.lng}`);
  expect(Number(url.searchParams.get("heading"))).toBeCloseTo(second.heading, 5);
  expect(await destination.evaluate(() => window.opener === null)).toBe(true);
  await destination.close();
  await expect(panel).toBeVisible(); // Panel clicks do not toggle map selection.
  // The transparent indicator's own anchor must also remain click-through.
  const anchor = await page.evaluate(() => {
    const { map } = window.streetViewFixture; let point;
    map.eachLayer(layer => { if (layer.options.icon?.options.className === "x-street-view-direction") point = map.latLngToContainerPoint(layer.getLatLng()); });
    const box = map.getContainer().getBoundingClientRect(); return { x: box.x + point.x, y: box.y + point.y };
  });
  await page.mouse.click(anchor.x, anchor.y); await expect(panel).toBeHidden(); await expect(arrows).toHaveCount(0);
  await emptyClick(page, 0.65, 0.7); await expect(panel).toBeVisible(); await expect(arrows).toHaveCount(1);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.streetViewFixture.map.fire("click", { latlng: { lat: 35.68, lng: 139.76 } }));
    await expect(panel).toBeHidden();
    await page.evaluate(() => window.streetViewFixture.map.fire("click", { latlng: { lat: 35.68, lng: 139.76 } }));
    await expect(arrows).toHaveCount(1);
  }
  const state = await page.evaluate(async () => {
    const { app, map } = window.streetViewFixture;
    await app.unuse("x-street-view");
    const removed = !map.listens("dragend") && !map.listens("dragstart");
    await app.use("x-street-view");
    const reset = !document.querySelector(".x-street-view-direction") && document.querySelector(".x-street-view-panel").hidden;
    map.fire("click", { latlng: { lat: 35.68, lng: 139.76 } });
    await app.destroy();
    return { removed, reset, afterDestroy: document.querySelectorAll(".x-street-view-panel,.x-street-view-direction,.x-street-view-mount").length };
  });
  expect(state).toEqual({ removed: true, reset: true, afterDestroy: 0 });
  expect(errors).toEqual([]);
});

test("GPX and Photo clicks retain semantic selection; background clicks also clear it", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await ready(page);
  await page.evaluate(async () => {
    const { app } = window.streetViewFixture;
    await app.domains.gpx.create({ tracks: [{ segments: [{ points: [{ lat: 35.68, lon: 139.75 }, { lat: 35.69, lon: 139.75 }] }] }], waypoints: [{ lat: 35.68, lon: 139.76, name: "Smoke waypoint" }] });
    await app.domains.photo.create({ data: { name: "Smoke photo", coordinate: { lat: 35.68, lon: 139.77 } }, blob: new Blob(["photo"], { type: "image/jpeg" }) });
  });
  const panel = page.locator(".x-street-view-panel");
  await page.locator('[title="Smoke waypoint"]').click();
  expect(await page.evaluate(() => window.streetViewFixture.app.selection.getCurrent().ref.kind)).toBe("waypoint");
  await expect(panel).toBeHidden();
  await page.locator('[title="Smoke photo"]').click();
  expect(await page.evaluate(() => window.streetViewFixture.app.selection.getCurrent().domain.id)).toBe("photo");
  await expect(panel).toBeHidden();
  const pixel = await page.evaluate(() => {
    const map = window.streetViewFixture.map, p = map.latLngToContainerPoint([35.685, 139.75]), b = map.getContainer().getBoundingClientRect();
    return { x: b.left + p.x, y: b.top + p.y };
  });
  await page.mouse.click(pixel.x, pixel.y);
  expect(await page.evaluate(() => window.streetViewFixture.app.selection.getCurrent().ref.kind)).toBe("track-point");
  await expect(panel).toBeHidden();
  await emptyClick(page); await expect(panel).toBeVisible();
  expect(await page.evaluate(() => window.streetViewFixture.app.selection.getCurrent())).toBeNull();
  await page.locator('[title="Smoke waypoint"]').click(); await expect(panel).toBeVisible();
  await emptyClick(page, 0.6, 0.8); await expect(panel).toBeHidden();
  await page.evaluate(() => window.streetViewFixture.app.destroy());
  expect(errors).toEqual([]);
});

test("discovers the plugin by ID with tuple options independently of the document base", async ({ page }) => {
  const loaders = [], errors = [];
  page.on("request", request => { if (request.url().includes("x-street-view/loader.js")) loaders.push(new URL(request.url()).pathname); });
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, "?options");
  expect(loaders).toEqual(["/plugins/x-street-view/loader.js"]);
  expect(await page.evaluate(() => document.baseURI)).toContain("/unrelated-hosting-base/");
  expect(await page.evaluate(() => window.streetViewFixture.app.hasPlugin("x-street-view"))).toBe(true);
  await emptyClick(page); await expect(page.locator(".x-street-view-panel")).toBeVisible();
  await page.evaluate(() => window.streetViewFixture.app.unuse("x-street-view"));
  await expect(page.locator(".x-street-view-panel")).toHaveCount(0);
  await page.evaluate(() => window.streetViewFixture.app.use("x-street-view", {}));
  await expect(page.locator(".x-street-view-panel")).toBeHidden();
  await emptyClick(page, 0.6, 0.8); await expect(page.locator(".x-street-view-panel")).toBeVisible();
  await page.evaluate(() => window.streetViewFixture.app.destroy());
  await expect(page.locator(".x-street-view-panel")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("measured button geometry follows arrow tips, map motion and URL form coexistence", async ({ page }) => {
  await ready(page);
  const point = await page.evaluate(async () => {
    const { app, map } = window.streetViewFixture;
    await app.use("tilia-url-import");
    const p = map.getCenter();
    map.fire("click", { latlng: p });
    return { lat: p.lat, lng: p.lng };
  });
  await page.getByRole("button", { name: "Load URL", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Load URL" })).toBeVisible();
  const geometry = () => page.evaluate(point => {
    const { map } = window.streetViewFixture;
    const origin = map.latLngToContainerPoint(point), mapBox = map.getContainer().getBoundingClientRect();
    const panel = document.querySelector(".x-street-view-panel"), box = panel.getBoundingClientRect();
    const svg = document.querySelector(".x-street-view-direction svg");
    const heading = svg ? Number(svg.dataset.heading) : null;
    const radians = (heading ?? 0) * Math.PI / 180;
    const x = Math.sin(radians), y = -Math.cos(radians);
    const tip = { x: mapBox.x + origin.x + 52 * x, y: mapBox.y + origin.y + 52 * y };
    const dx = Math.max(box.left - tip.x, tip.x - box.right, 0);
    const dy = Math.max(box.top - tip.y, tip.y - box.bottom, 0);
    const form = document.querySelector(".tilia-url-floating-panel").getBoundingClientRect();
    return { heading, gap: Math.hypot(dx, dy), width: box.width,
      horizontal: getComputedStyle(panel).transform,
      beyond: (box.x + box.width / 2 - tip.x) * x + (box.y + box.height / 2 - tip.y) * y,
      horizontalOffset: box.x + box.width / 2 - mapBox.x - origin.x,
      verticalOffset: box.y + box.height / 2 - mapBox.y - origin.y,
      overlapsForm: box.left < form.right && box.right > form.left && box.top < form.bottom && box.bottom > form.top };
  }, point);
  const initial = await geometry();
  expect(initial.heading).toBe(0); expect(initial.horizontalOffset).toBeCloseTo(0, 0);
  expect(initial.verticalOffset).toBeLessThan(-52);
  expect(initial.gap).toBeCloseTo(8, 0); expect(initial.beyond).toBeGreaterThan(0);
  expect(initial.horizontal).toMatch(/^matrix\(1, 0, 0, 1,/);
  expect(initial.overlapsForm).toBe(false);
  for (const [dx, dy, heading] of [[0, 100, 0], [-100, 0, 90], [0, -100, 180], [100, 0, 270], [-100, 100, 45]]) {
    await pan(page, dx, dy);
    await page.evaluate(point => window.streetViewFixture.map.panTo(point, { animate: false }), point);
    const state = await geometry();
    expect(state.heading).toBeCloseTo(heading, -1);
    expect(state.gap).toBeGreaterThan(7); expect(state.gap).toBeLessThan(13);
    expect(state.beyond).toBeGreaterThan(0);
    expect(state.horizontal).toMatch(/^matrix\(1, 0, 0, 1,/);
    expect(state.overlapsForm).toBe(false);
  }
  const oldWidth = (await geometry()).width;
  await page.locator(".x-street-view-panel button").evaluate(button => { button.style.fontSize = "28px"; });
  await expect.poll(async () => (await geometry()).width).toBeGreaterThan(oldWidth);
  await expect.poll(async () => (await geometry()).gap).toBeGreaterThan(7);
  expect((await geometry()).gap).toBeLessThan(13);
  const selectedCoordinate = (await indicator(page))[0].coordinate;
  for (const zoom of [14, 12, 13]) {
    await page.evaluate(({ point, zoom }) => {
      const { map } = window.streetViewFixture;
      map.setView(point, zoom, { animate: false });
      map.panBy([30, 20], { animate: false });
      map.getContainer().style.width = "800px";
      map.invalidateSize({ pan: false });
    }, { point, zoom });
    const state = await geometry();
    expect(state.gap).toBeGreaterThan(7); expect(state.gap).toBeLessThan(13);
    expect((await indicator(page))[0].coordinate).toEqual(selectedCoordinate);
  }
  await page.evaluate(() => window.streetViewFixture.app.destroy());
});
