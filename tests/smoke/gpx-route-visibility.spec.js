import { expect, test } from "@playwright/test";
async function ready(page, many = false) {
  await page.goto('/samples/phase-4h/');
  await expect(page.locator('body')).toHaveAttribute('data-phase4h-ready', 'true');
  await page.evaluate(async (many) => {
    const { app, map } = window.phase4h;
    const p = (lat, lon, name) => ({ lat, lon, name });
    const data = { name: 'routes.gpx', tracks: [{ name: 'Track', segments: [{ points: [p(35.02, 135), p(35.025, 135.005)] }] }], routes: [
      { name: 'Route A', points: [p(35, 135, 'A start'), p(35.005, 135.005, 'A end')] },
      { name: 'Route B', points: [p(34.99, 134.99, 'B only')] }, { name: 'Empty route', points: [] },
    ], waypoints: [p(35.01, 134.99, 'Waypoint')] };
    if (many) for (let i = 0; i < 5; i++) await app.domains.gpx.create({ ...data, name: `filler ${i}` });
    window.phase4h.entryId = (await app.domains.gpx.create(data)).id;
    map.setView([35.005, 135], 13, { animate: false });
  }, many);
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
}
const toggle = (page, index) => page.getByRole('checkbox', { name: `routes.gpx show route ${index + 1}`, exact: true });
const current = (page) => page.evaluate(() => window.phase4h.app.selection.getCurrent());
const popup = (page) => page.locator('.leaflet-popup');
async function trackNavigation(page) {
  await page.evaluate(() => {
    const { map } = window.phase4h; window.phase4h.navigation = [];
    for (const method of ['panTo', 'panBy', 'fitBounds']) {
      const old = map[method]; map[method] = function (...args) { window.phase4h.navigation.push(method); return old.apply(this, args); };
    }
  });
}

test('route checkboxes preserve DOM, focus and scroll; no selection or popup/navigation; category/entry gates retain preferences', async ({ page }) => {
  await ready(page, true);
  const a = toggle(page, 0); await a.scrollIntoViewIfNeeded(); await a.focus();
  const initial = await page.evaluate(() => {
    const host = document.querySelector('.tilia-layer-list'), checkbox = document.activeElement;
    const dom = window.phase4h.dom = { host, checkbox, rows: [...host.querySelectorAll('.tilia-layer-item')], trees: [...host.querySelectorAll('.tilia-gpx-tree')], changes: [] };
    dom.observer = new MutationObserver((records) => dom.changes.push(...records)); dom.observer.observe(host, { subtree: true, childList: true });
    return { scroll: host.scrollTop, beforeName: checkbox.parentElement.firstElementChild === checkbox && checkbox.nextElementSibling.textContent === 'Route A' };
  });
  expect(initial.beforeName).toBe(true); expect(initial.scroll).toBeGreaterThan(0);
  await trackNavigation(page); await page.keyboard.press('Space'); await expect(a).not.toBeChecked(); await expect(a).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.phase4h.app.domains.gpx.get(window.phase4h.entryId).snapshot.preferences.routeVisibility[0])).toBe(false);
  expect(await current(page)).toBeNull(); await expect(popup(page)).toHaveCount(0);
  expect(await page.evaluate(() => {
    const { dom, navigation } = window.phase4h;
    return { mutations: dom.changes.length + dom.observer.takeRecords().length, scroll: dom.host.scrollTop,
      rows: dom.rows.every((n, i) => n === dom.host.querySelectorAll('.tilia-layer-item')[i]),
      trees: dom.trees.every((n, i) => n === dom.host.querySelectorAll('.tilia-gpx-tree')[i]), navigation };
  })).toEqual({ mutations: 0, scroll: initial.scroll, rows: true, trees: true, navigation: [] });
  const category = page.getByRole('checkbox', { name: 'routes.gpx routes', exact: true });
  await category.uncheck(); await category.check(); await expect(a).not.toBeChecked();
  const entryCheck = page.getByRole('checkbox', { name: await page.evaluate(() => `Show entry ${window.phase4h.entryId}`), exact: true });
  await entryCheck.uncheck(); await entryCheck.check(); await expect(a).not.toBeChecked(); await expect(toggle(page, 1)).toBeChecked();
  await a.focus(); await page.keyboard.press('Space'); await expect(a).toBeChecked(); await expect(a).toBeFocused();
  expect(await current(page)).toBeNull(); expect(await page.evaluate(() => window.phase4h.navigation)).toEqual([]);
});

for (const kind of ['route', 'route-point']) {
  test(`hiding selected ${kind} clears popup and indicator while unrelated route selection preserves popup intent`, async ({ page }) => {
    await ready(page);
    if (kind === 'route') await page.getByRole('button', { name: 'Route A', exact: true }).click();
    else await page.getByRole('button', { name: 'A start', exact: true }).click();
    await expect(popup(page)).toHaveCount(1); expect((await current(page)).ref.kind).toBe(kind);
    await trackNavigation(page); await toggle(page, 0).uncheck(); await expect.poll(() => current(page)).toBeNull();
    await expect(popup(page)).toHaveCount(0); await expect(page.locator('.tilia-selection-crosshair')).toHaveCount(0);
    expect(await page.evaluate(() => window.phase4h.navigation)).toEqual([]);
    await toggle(page, 0).check(); await expect(popup(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Route B', exact: true }).click(); await expect(popup(page)).toHaveCount(1);
    await page.locator('.leaflet-popup-close-button').click();
    await page.evaluate(() => { window.phase4h.navigation = []; });
    await toggle(page, 0).uncheck(); expect((await current(page)).ref.routeIndex).toBe(1); await expect(popup(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.phase4h.navigation)).toEqual([]);
    await toggle(page, 0).check(); expect((await current(page)).ref.routeIndex).toBe(1); await expect(popup(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Route B', exact: true }).click(); await expect.poll(() => current(page)).toBeNull();
    await page.getByRole('button', { name: 'B only', exact: true }).click(); await expect(popup(page)).toHaveCount(1);
    await page.evaluate(() => { window.phase4h.navigation = []; });
    await toggle(page, 0).uncheck(); expect((await current(page)).ref.routeIndex).toBe(1); await expect(popup(page)).toHaveCount(1);
    expect(await page.evaluate(() => window.phase4h.navigation)).toEqual([]);
  });
}

test('real Leaflet route lines and number markers hide together; colors/numbering survive API generations and replacement; teardown releases listeners', async ({ page }) => {
  await ready(page);
  const geometry = () => page.locator('[data-tilia-map-band="geometry"] path.leaflet-interactive');
  const markers = () => page.locator('.tilia-route-point-marker');
  const colors = () => markers().evaluateAll((nodes) => nodes.map((n) => [n.textContent, n.style.getPropertyValue('--route-color')]));
  await expect(geometry()).toHaveCount(2); await expect(markers()).toHaveCount(3);
  expect(await colors()).toEqual([['1', '#5c6bc0'], ['2', '#5c6bc0'], ['1', '#c855bc']]);
  await page.getByRole('button', { name: 'A start', exact: true }).click(); await expect(popup(page)).toHaveCount(1);
  await page.evaluate(async () => {
    const { app, entryId, map } = window.phase4h;
    map.eachLayer((layer) => { if (layer.options.icon?.options.routeColor === '#5c6bc0') window.phase4h.oldMarker = layer; });
    await app.domains.gpx.setRouteVisibility(entryId, { routeIndex: 0, visible: false }, { expectedRevision: 1 });
  });
  await expect(markers()).toHaveCount(1); await expect(geometry()).toHaveCount(1); await expect(toggle(page, 0)).not.toBeChecked();
  expect((await current(page)).ref).toMatchObject({ kind: 'route-point', routeIndex: 0, revision: 2 });
  await expect(popup(page)).toHaveCount(0); await expect(page.locator('.tilia-selection-crosshair')).toHaveCount(0);
  await page.evaluate(() => window.phase4h.oldMarker.fire('click')); await expect(popup(page)).toHaveCount(0);
  await toggle(page, 0).check(); await expect(markers()).toHaveCount(3); await expect(popup(page)).toHaveCount(1);
  expect(await colors()).toEqual([['1', '#5c6bc0'], ['2', '#5c6bc0'], ['1', '#c855bc']]);
  await toggle(page, 1).uncheck(); await expect(markers()).toHaveCount(2); await expect(geometry()).toHaveCount(2);
  await toggle(page, 2).uncheck(); await expect(markers()).toHaveCount(2);
  await page.evaluate(async () => {
    const { app, entryId } = window.phase4h;
    await app.domains.gpx.setStylePreset(entryId, 'forest', { expectedRevision: app.domains.gpx.get(entryId).revision });
    const view = app.domains.gpx.get(entryId);
    await app.domains.gpx.replaceData(entryId, { ...view.snapshot.data, name: 'replaced.gpx' }, { expectedRevision: view.revision });
  });
  await expect(markers()).toHaveCount(2); expect(await colors()).toEqual([['1', '#2a9d8f'], ['2', '#2a9d8f']]);
  await expect(page.getByRole('checkbox', { name: 'replaced.gpx show route 2', exact: true })).not.toBeChecked();
  await page.evaluate(async () => { window.phase4h.stale = document.querySelector('.tilia-gpx-route-visible'); await window.phase4h.app.unuse('tilia-gpx-ui'); });
  await expect(page.locator('.tilia-gpx-route-visible')).toHaveCount(0);
  await page.evaluate(() => { window.phase4h.stale.checked = false; window.phase4h.stale.dispatchEvent(new Event('change')); });
  expect(await page.evaluate(() => window.phase4h.app.domains.gpx.get(window.phase4h.entryId).snapshot.preferences.routeVisibility[0])).toBe(true);
  await page.evaluate(() => window.phase4h.app.entries.remove(window.phase4h.entryId)); await expect(markers()).toHaveCount(0); await expect(geometry()).toHaveCount(0); await expect(popup(page)).toHaveCount(0);
});
