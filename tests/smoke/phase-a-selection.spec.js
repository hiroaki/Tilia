import { expect, test } from "@playwright/test";

async function ready(page) {
  await page.goto("/tests/fixtures/phase-4h/");
  await expect(page.locator("body")).toHaveAttribute("data-phase4h-ready", "true");
  await page.evaluate(async () => {
    const { app, map } = window.phase4h;
    const point = (lat, lon, name) => ({ lat, lon, name });
    const entry = await app.domains.gpx.create({ name: "phase-a.gpx", tracks: [
      { name: "Track A", segments: [{ points: [point(35, 135), point(35.012, 135.012)] }] },
      { name: "Track B", segments: [{ points: [point(35.015, 135), point(35.027, 135.012)] }] },
    ], routes: [{ name: "Route A", points: [point(34.989, 134.989, "Route start"), point(34.989, 135.004, "Route end")] }],
    waypoints: [point(35.008, 134.988, "Waypoint A")] });
    window.phase4h.entryId = entry.id;
    map.setView([35.005, 135], 13, { animate: false });
  });
  await expect(page.locator('.tilia-route-point-marker')).toHaveCount(2);
  await expect(page.locator('[data-tilia-map-band="geometry"] path.leaflet-interactive')).toHaveCount(3);
}
const selected = (page) => page.evaluate(() => window.phase4h.app.selection.getCurrent());
const popup = (page) => page.locator('.leaflet-popup');
const crosshair = (page) => page.locator('.tilia-selection-crosshair');
async function clickEmpty(page) {
  const box = await page.locator('#map').boundingBox();
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.85);
}
async function clickSelectedCoordinate(page) {
  const pixel = await page.evaluate(() => {
    const { app, map } = window.phase4h, current = app.selection.getCurrent();
    const value = app.domains.gpx.selection.resolve(current.entryId, current.ref);
    const p = map.latLngToContainerPoint([value.lat, value.lon]), box = map.getContainer().getBoundingClientRect();
    // The default waypoint icon ends at its geographic anchor. Click just
    // inside its tip, where the X overlaps the ordinary clickable icon.
    const offset = current.ref.kind === 'waypoint' ? -4 : 0;
    return { x: box.left + p.x + offset, y: box.top + p.y + offset };
  });
  await page.mouse.click(pixel.x, pixel.y);
}
async function instrumentNavigation(page) {
  await page.evaluate(() => {
    const { map } = window.phase4h; window.phase4h.navigation = [];
    for (const name of ['panTo', 'fitBounds', 'panBy']) {
      const original = map[name];
      map[name] = function (...args) { window.phase4h.navigation.push(name); return original.apply(this, args); };
    }
  });
}

test('real point clicks reopen dismissed popup; empty map clears selection and Layers highlight', async ({ page }) => {
  await ready(page);
  const marker = page.locator('img.leaflet-marker-icon[title="Waypoint A"]');
  await marker.click(); await expect(popup(page)).toBeVisible();
  expect((await selected(page)).ref.kind).toBe('waypoint');
  await page.locator('.leaflet-popup-close-button').click(); await expect(popup(page)).toHaveCount(0);
  expect((await selected(page)).ref.kind).toBe('waypoint'); await expect(crosshair(page)).toHaveCount(1);
  await clickSelectedCoordinate(page); await expect(popup(page)).toBeVisible();
  await clickSelectedCoordinate(page); await expect(popup(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Waypoint A', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await clickEmpty(page); await expect.poll(() => selected(page)).toBeNull();
  await expect(crosshair(page)).toHaveCount(0); await expect(popup(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Waypoint A', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

for (const kind of ['waypoint', 'route-point', 'track-point']) {
  test(`${kind} X uses the geographic center, fixed dimensions, selection pane and click-through`, async ({ page }) => {
    await ready(page);
    if (kind === 'waypoint') await page.locator('img.leaflet-marker-icon[title="Waypoint A"]').click();
    else if (kind === 'route-point') await page.locator('.tilia-route-point-marker').first().click();
    else await page.locator('[data-tilia-map-band="geometry"] path.leaflet-interactive').first().click();
    await expect(popup(page)).toBeVisible(); expect((await selected(page)).ref.kind).toBe(kind);
    for (const zoom of [13, 15]) {
      await page.evaluate((zoom) => {
        const { app, map } = window.phase4h, current = app.selection.getCurrent();
        const value = app.domains.gpx.selection.resolve(current.entryId, current.ref);
        map.setView([value.lat, value.lon], zoom, { animate: false });
      }, zoom);
      const geometry = await page.evaluate(() => {
        const { app, map } = window.phase4h, current = app.selection.getCurrent();
        const value = app.domains.gpx.selection.resolve(current.entryId, current.ref), pixel = map.latLngToContainerPoint([value.lat, value.lon]);
        const element = document.querySelector('.tilia-selection-crosshair'), box = element.getBoundingClientRect(), mapBox = map.getContainer().getBoundingClientRect();
        const pane = element.closest('.leaflet-pane'), ordinary = document.querySelector('[data-tilia-map-band="markers"]');
        const before = getComputedStyle(element, '::before'), after = getComputedStyle(element, '::after');
        return { width: box.width, height: box.height, dx: box.left + box.width / 2 - mapBox.left - pixel.x, dy: box.top + box.height / 2 - mapBox.top - pixel.y,
          pointer: getComputedStyle(element).pointerEvents, interactive: element.classList.contains('leaflet-interactive'), band: pane.dataset.tiliaMapBand,
          above: Number(getComputedStyle(pane).zIndex) > Number(getComputedStyle(ordinary).zIndex),
          diagonals: before.transform !== after.transform && before.height === '3px' && after.height === '3px' };
      });
      expect(geometry).toMatchObject({ width: 36, height: 36, pointer: 'none', interactive: false, band: 'selection', above: true, diagonals: true });
      expect(Math.abs(geometry.dx)).toBeLessThanOrEqual(1); expect(Math.abs(geometry.dy)).toBeLessThanOrEqual(1);
      await page.locator('.leaflet-popup-close-button').click(); await expect(popup(page)).toHaveCount(0);
      await clickSelectedCoordinate(page); await expect(popup(page)).toBeVisible(); expect((await selected(page)).ref.kind).toBe(kind);
    }
  });
}

test('Layers name toggles selection while checkbox actions preserve unrelated selection without navigation', async ({ page }) => {
  await ready(page); await page.getByRole('button', { name: 'Layers', exact: true }).click();
  const name = page.getByRole('button', { name: 'Track A', exact: true });
  await name.click(); await expect(popup(page)).toBeVisible(); expect((await selected(page)).ref).toMatchObject({ kind: 'track', trackIndex: 0 });
  await name.click(); await expect.poll(() => selected(page)).toBeNull(); await expect(popup(page)).toHaveCount(0);
  await name.click(); await expect(popup(page)).toBeVisible();
  await instrumentNavigation(page);
  const trackB = page.getByRole('checkbox', { name: 'phase-a.gpx show track 2', exact: true });
  await trackB.uncheck(); await expect.poll(async () => (await selected(page))?.ref.trackIndex).toBe(0);
  await expect(popup(page)).toBeVisible(); expect(await page.evaluate(() => window.phase4h.navigation)).toEqual([]);
  await page.locator('.leaflet-popup-close-button').click(); await expect(popup(page)).toHaveCount(0);
  await trackB.check(); await expect(popup(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.phase4h.navigation)).toEqual([]);
  await page.getByRole('checkbox', { name: 'phase-a.gpx show track 1', exact: true }).uncheck();
  await expect.poll(() => selected(page)).toBeNull(); await expect(popup(page)).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'phase-a.gpx show track 1', exact: true }).check();
  await expect.poll(() => selected(page)).toBeNull(); expect(await page.evaluate(() => window.phase4h.navigation)).toEqual([]);
});

test('Settings visibility checkboxes clear affected route/waypoint selections without opening popup or navigating', async ({ page }) => {
  await ready(page); await page.locator('.tilia-route-point-marker').first().click(); await expect(popup(page)).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click(); await instrumentNavigation(page);
  const settings = page.locator('.tilia-gpx-visibility-settings');
  await settings.getByRole('checkbox', { name: 'routes', exact: true }).uncheck();
  await expect.poll(() => selected(page)).toBeNull(); await expect(popup(page)).toHaveCount(0); await expect(crosshair(page)).toHaveCount(0);
  await settings.getByRole('checkbox', { name: 'routes', exact: true }).check(); await expect(popup(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.phase4h.navigation)).toEqual([]);
  await page.locator('img.leaflet-marker-icon[title="Waypoint A"]').click(); await expect(popup(page)).toBeVisible();
  await page.locator('.leaflet-popup-close-button').click(); await expect(popup(page)).toHaveCount(0);
  await page.evaluate(() => { window.phase4h.navigation = []; });
  await settings.getByRole('checkbox', { name: 'waypoints', exact: true }).uncheck();
  await expect.poll(() => selected(page)).toBeNull(); await expect(crosshair(page)).toHaveCount(0);
  await settings.getByRole('checkbox', { name: 'waypoints', exact: true }).check();
  await expect(popup(page)).toHaveCount(0); expect(await page.evaluate(() => window.phase4h.navigation)).toEqual([]);
});

for (const open of [true, false]) {
  test(`generation replacement preserves popup intent=${open}; stale object events cannot reopen it`, async ({ page }) => {
    await ready(page); await page.locator('.tilia-route-point-marker').first().click(); await expect(popup(page)).toBeVisible();
    await page.evaluate(() => {
      const { map } = window.phase4h;
      map.eachLayer((layer) => { if (layer.options.icon?.options.className === 'tilia-route-point-marker') window.phase4h.oldMarker = layer; });
    });
    if (!open) { await page.locator('.leaflet-popup-close-button').click(); await expect(popup(page)).toHaveCount(0); }
    await instrumentNavigation(page);
    await page.evaluate(async () => {
      const { app, entryId } = window.phase4h;
      await app.domains.gpx.setStylePreset(entryId, 'magenta', { expectedRevision: app.domains.gpx.get(entryId).revision });
    });
    await expect.poll(async () => (await selected(page))?.ref.revision).toBe(2);
    await expect(popup(page)).toHaveCount(open ? 1 : 0);
    if (open) expect(await page.evaluate(() => { let autoPan; window.phase4h.map.eachLayer((layer) => { if (layer.options.className === 'tilia-info-popup-window') autoPan = layer.options.autoPan; }); return autoPan; })).toBe(false);
    expect(await page.evaluate(() => window.phase4h.navigation)).toEqual([]);
    await page.evaluate(() => window.phase4h.oldMarker.fire('click'));
    await expect(popup(page)).toHaveCount(open ? 1 : 0); expect((await selected(page)).ref.pointIndex).toBe(0);
    await page.evaluate(async () => { const { app, entryId } = window.phase4h; await app.entries.remove(entryId); });
    await expect(popup(page)).toHaveCount(0); await expect(crosshair(page)).toHaveCount(0); expect(await selected(page)).toBeNull();
  });
}

test('real modal interaction consumes object and empty map clicks before background clearing; disposal removes the binding', async ({ page }) => {
  await ready(page); await page.locator('.tilia-route-point-marker').first().click(); await expect(popup(page)).toBeVisible();
  await page.evaluate(async () => {
    const { app } = window.phase4h;
    await app.use({ id: 'x-phase-a-modal', setup(context) {
      context.interactions.bind({ id: 'modal-click', surface: context.interactions.mapSurface(), event: 'click', tier: 'modal',
        handle: () => ({ consume: true }) });
    } });
  });
  await clickEmpty(page); expect((await selected(page)).ref.kind).toBe('route-point');
  await page.locator('.leaflet-popup-close-button').click(); await expect(popup(page)).toHaveCount(0);
  await page.locator('img.leaflet-marker-icon[title="Waypoint A"]').click(); expect((await selected(page)).ref.kind).toBe('route-point');
  await page.evaluate(() => window.phase4h.app.unuse('x-phase-a-modal')); await clickEmpty(page); await expect.poll(() => selected(page)).toBeNull();
  await page.locator('.tilia-route-point-marker').first().click(); await expect(popup(page)).toBeVisible();
  await page.evaluate(() => window.phase4h.app.unuse('tilia-map-selection-presenter'));
  await expect(popup(page)).toHaveCount(0); await expect(crosshair(page)).toHaveCount(0);
  await clickEmpty(page); await expect.poll(() => selected(page)).toBeNull();
});

test('application background clearing survives presenter reinstall, handles Photo, and detaches from a retained Leaflet map', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  await page.evaluate(async () => {
    const { app, context } = window.phase4h;
    window.phase4h.changes = [];
    context.selection.subscribe(event => window.phase4h.changes.push(event.reason));
    await app.domains.photo.create({ data: { name: 'Background photo', coordinate: { lat: 35.024, lon: 134.985 } } });
  });
  await clickEmpty(page); await clickEmpty(page);
  expect(await selected(page)).toBeNull();
  expect(await page.evaluate(() => window.phase4h.changes)).toEqual([]);
  const photo = page.locator('img.leaflet-marker-icon[title="Background photo"]');
  await expect(photo).toBeVisible();
  await page.locator('.tilia-route-point-marker').first().click();
  expect((await selected(page)).ref.kind).toBe('route-point');
  await photo.click(); expect((await selected(page)).ref.kind).toBe('photo');
  await expect(popup(page)).toBeVisible();
  await page.locator('.leaflet-popup-close-button').click();
  expect((await selected(page)).ref.kind).toBe('photo');
  await photo.click(); await expect(popup(page)).toBeVisible();
  await clickEmpty(page); await expect.poll(() => selected(page)).toBeNull();
  await expect(popup(page)).toHaveCount(0);
  for (let i = 0; i < 2; i++) {
    await photo.click(); expect((await selected(page)).ref.kind).toBe('photo');
    await page.evaluate(() => window.phase4h.app.unuse('tilia-map-selection-presenter'));
    await expect(popup(page)).toHaveCount(0);
    await clickEmpty(page); await expect.poll(() => selected(page)).toBeNull();
    await page.evaluate(() => window.phase4h.app.use('tilia-map-selection-presenter'));
  }
  await photo.click(); await expect(popup(page)).toBeVisible();
  await page.evaluate(() => window.phase4h.app.destroy());
  await expect(popup(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.phase4h.map.listens('click'))).toBe(false);
  await clickEmpty(page);
  expect(errors).toEqual([]);
});
