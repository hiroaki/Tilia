import { expect, test } from "@playwright/test";

async function ready(page, many = false) {
  await page.goto('/tests/fixtures/phase-4h/');
  await expect(page.locator('body')).toHaveAttribute('data-phase4h-ready', 'true');
  await page.evaluate(async (many) => {
    const { app } = window.phase4h;
    const point = (lat) => ({ lat, lon: 135 });
    const ids = [];
    for (let i = 0; i < (many ? 9 : 1); i++) {
      const entry = await app.domains.gpx.create({ name: `Entry ${i}`, tracks: [
        { name: `Track ${i}`, segments: [{ points: [point(35), point(35.01)] }, { points: [] }] },
        { name: `Empty track ${i}`, segments: [] },
      ], routes: [{ name: `Empty route ${i}`, points: [] }], waypoints: [point(35.02)] });
      ids.push(entry.id);
    }
    window.phase4h.ids = ids;
  }, many);
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await expect(page.locator('.tilia-layer-item')).toHaveCount(many ? 9 : 1);
}

async function observe(page) {
  await page.evaluate(() => {
    const host = document.querySelector('.tilia-layer-list');
    window.phase4h.dom = { host, rows: [...host.querySelectorAll('.tilia-layer-item')], trees: [...host.querySelectorAll('.tilia-gpx-tree')], mutations: [] };
    const state = window.phase4h.dom;
    state.observer = new MutationObserver((records) => state.mutations.push(...records));
    state.observer.observe(host, { childList: true, subtree: true });
  });
}
async function snapshot(page) {
  return page.evaluate(() => {
    const { dom } = window.phase4h;
    return { mutations: dom.mutations.length + dom.observer.takeRecords().length,
      rows: dom.rows.every((node, i) => node === dom.host.querySelectorAll('.tilia-layer-item')[i]),
      trees: dom.trees.every((node, i) => node === dom.host.querySelectorAll('.tilia-gpx-tree')[i]),
      scroll: dom.host.scrollTop, focused: document.activeElement === dom.focused };
  });
}

test('ordinary checkbox and selection updates preserve DOM, scroll and checkbox focus', async ({ page }) => {
  await ready(page, true);
  const checkbox = page.getByRole('checkbox', { name: 'Entry 4 show track 1', exact: true });
  await checkbox.scrollIntoViewIfNeeded(); await checkbox.focus();
  await observe(page);
  const initial = await page.evaluate(() => {
    const { dom } = window.phase4h; dom.focused = document.activeElement;
    return dom.host.scrollTop;
  });
  expect(initial).toBeGreaterThan(0);
  await page.keyboard.press('Space'); await expect(checkbox).not.toBeChecked(); await expect(checkbox).toBeEnabled();
  await expect.poll(() => page.evaluate(() => window.phase4h.app.domains.gpx.get(window.phase4h.ids[4]).snapshot.preferences.trackVisibility[0])).toBe(false);
  expect(await snapshot(page)).toEqual({ mutations: 0, rows: true, trees: true, scroll: initial, focused: true });
  await page.keyboard.press('Space'); await expect(checkbox).toBeChecked(); await expect(checkbox).toBeEnabled();
  // A selection with no geometry produces no popup navigation, isolating the
  // panel's natural scrolling and focus behavior from intentional map movement.
  await page.evaluate(async () => {
    const { app, ids } = window.phase4h;
    await app.selection.request(app.domains.gpx.selection.createCandidate(ids[4], { kind: 'track', trackIndex: 1 }));
    await app.selection.clear();
    await app.selection.request(app.domains.gpx.selection.createCandidate(ids[4], { kind: 'track', trackIndex: 1 }));
  });
  expect(await snapshot(page)).toEqual({ mutations: 0, rows: true, trees: true, scroll: initial, focused: true });
  const entryToggle = page.getByRole('checkbox', { name: await page.evaluate(() => `Show entry ${window.phase4h.ids[4]}`), exact: true });
  await entryToggle.focus();
  await page.evaluate(() => { window.phase4h.dom.focused = document.activeElement; });
  await page.keyboard.press('Space'); await expect(entryToggle).not.toBeChecked(); await expect(entryToggle).toBeEnabled();
  await expect.poll(() => page.evaluate(() => window.phase4h.app.selection.getCurrent())).toBeNull();
  expect(await snapshot(page)).toEqual({ mutations: 0, rows: true, trees: true, scroll: initial, focused: true });
});

test('category checkbox precedes its label; keyboard visibility changes preserve selection isolation', async ({ page }) => {
  await ready(page);
  const category = page.getByRole('checkbox', { name: 'Entry 0 tracks', exact: true });
  expect(await category.evaluate((node) => node.parentElement.firstElementChild === node && node.nextElementSibling.textContent === 'tracks')).toBe(true);
  await observe(page);
  await category.focus(); await page.keyboard.press('Space'); await expect(category).not.toBeChecked(); await expect(category).toBeEnabled();
  expect(await page.evaluate(() => window.phase4h.app.selection.getCurrent())).toBeNull();
  await expect(page.locator('.leaflet-popup')).toHaveCount(0);
  await page.keyboard.press('Space'); await expect(category).toBeChecked(); await expect(category).toBeEnabled();
  const dom = await snapshot(page);
  expect(dom).toMatchObject({ mutations: 0, rows: true, trees: true });
  await expect(category).toBeFocused();
  const name = page.getByRole('button', { name: 'Track 0', exact: true });
  await name.focus(); await page.keyboard.press('Enter'); await expect(name).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.leaflet-popup')).toHaveCount(1);
  await page.keyboard.press('Enter'); await expect(name).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.leaflet-popup')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Entry 0 show track 1', exact: true }).uncheck();
  expect(await page.evaluate(() => window.phase4h.app.selection.getCurrent())).toBeNull();
  await expect(page.locator('.leaflet-popup')).toHaveCount(0);
});

test('addition, removal and replacement keep surviving rows, populated categories and scoped cleanup', async ({ page }) => {
  await ready(page); await observe(page);
  await expect(page.getByRole('button', { name: 'Empty track 0', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Empty route 0', exact: true })).toHaveCount(1);
  await expect(page.locator('.tilia-gpx-segment')).toHaveCount(2);
  expect(await page.locator('.tilia-layer-list ul').evaluateAll((lists) => lists.every((node) => node.children.length > 0))).toBe(true);
  await page.evaluate(async () => {
    const { app } = window.phase4h;
    window.phase4h.added = (await app.domains.gpx.create({ name: 'Added', waypoints: [{ lat: 35, lon: 135 }] })).id;
  });
  await expect(page.locator('.tilia-layer-name')).toHaveText(['Entry 0', 'Added']);
  expect(await page.evaluate(() => window.phase4h.dom.rows[0] === document.querySelector('.tilia-layer-item'))).toBe(true);
  await page.evaluate(async () => {
    const { app, ids } = window.phase4h;
    window.phase4h.oldCheckbox = document.querySelector('.tilia-gpx-category-visible');
    await app.domains.gpx.replaceData(ids[0], { name: 'Replaced', routes: [{ name: 'Kept empty route', points: [] }] }, { expectedRevision: 1 });
  });
  await expect(page.getByRole('button', { name: 'Kept empty route', exact: true })).toHaveCount(1);
  await expect(page.locator('.tilia-layer-item').first().locator('.tilia-gpx-category-visible')).toHaveCount(1);
  await expect(page.locator('.tilia-layer-item').first().locator('ul')).toHaveCount(2);
  expect(await page.evaluate(() => window.phase4h.dom.rows[0] === document.querySelector('.tilia-layer-item'))).toBe(true);
  await page.evaluate(() => { window.phase4h.oldCheckbox.checked = false; window.phase4h.oldCheckbox.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(await page.evaluate(() => window.phase4h.app.domains.gpx.get(window.phase4h.ids[0]).revision)).toBe(2);
  await page.evaluate(async () => {
    const { app, ids } = window.phase4h; await app.domains.gpx.replaceData(ids[0], { name: 'Empty' }, { expectedRevision: 2 });
  });
  await expect(page.locator('.tilia-layer-item').first().locator('ul')).toHaveCount(0);
  await page.evaluate(() => window.phase4h.app.entries.remove(window.phase4h.ids[0]));
  await expect(page.locator('.tilia-layer-name')).toHaveText(['Added']);
  await page.evaluate(async () => { window.phase4h.staleEntryToggle = document.querySelector('.tilia-layer-visible'); await window.phase4h.app.unuse('tilia-layers'); });
  await expect(page.locator('.tilia-layer-list')).toHaveCount(0);
  await page.evaluate(() => { window.phase4h.staleEntryToggle.checked = false; window.phase4h.staleEntryToggle.dispatchEvent(new Event('change')); });
  expect(await page.evaluate(() => window.phase4h.app.entries.get(window.phase4h.added).visible)).toBe(true);
});
