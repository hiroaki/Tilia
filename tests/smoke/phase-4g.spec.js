import { expect, test } from "@playwright/test";
import { mockPhotoExif, gpsPhoto, timestampPhoto } from "../helpers/photo-exif.js";

test.beforeEach(async ({ page }) => mockPhotoExif(page));

test("Phase 4G GPS Photo production lifecycle, popup/highlight independence and rendering termination", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/tests/fixtures/phase-4g/");
  await expect(page.locator("body")).toHaveAttribute("data-phase4g-ready", "true");
  await page.locator('input[type="file"]').setInputFiles(gpsPhoto);
  await expect(page.locator(".tilia-status-text")).toContainText("IMG_2889.JPG (exif-gps)");
  await expect(page.locator(".leaflet-marker-icon")).toHaveCount(1);
  await page.evaluate(() => {
    const f = window.phase4g, data = f.app.domains.photo.get(f.app.entries.list()[0].id).snapshot.data;
    f.map.setView([data.coordinate.lat, data.coordinate.lon], 13, { animate: false });
  });
  await page.locator(".leaflet-marker-icon").click();
  await expect(page.locator(".leaflet-popup")).toHaveCount(1);
  await expect(page.locator("svg path.leaflet-interactive")).toHaveCount(0); // non-interactive highlight
  await page.locator(".leaflet-popup-close-button").click();
  await expect(page.locator(".leaflet-popup")).toHaveCount(0);
  expect(await page.evaluate(() => ({ selection: window.phase4g.app.selection.getCurrent()?.ref,
    rings: window.phase4g.ringCount() })))
    .toEqual({ selection: { kind: "photo" }, rings: 1 });
  const lifecycle = await page.evaluate(async () => {
    const f = window.phase4g, app = f.app, id = app.entries.list()[0].id;
    const settle = async () => { for (let i = 0; i < 45; i++) await Promise.resolve(); };
    const old = f.handle(id);
    await app.entries.setVisible(id, false);
    await settle();
    const hidden = { invalid: old.signal.aborted && !old.isCurrent(), selected: !!app.selection.getCurrent() };
    await app.entries.setVisible(id, true); await settle();
    const fresh = f.handle(id);
    await app.unuse("tilia-photo-ui"); await settle();
    const adapterRemoved = { popup: document.querySelectorAll(".leaflet-popup").length,
      rings: f.ringCount(),
      selected: !!app.selection.getCurrent() };
    await app.use("tilia-photo-ui"); await settle();
    const revision = app.domains.photo.get(id).revision;
    await app.domains.photo.setRequestedTimeMode(id, "utc", { expectedRevision: revision }); await settle();
    const renewed = f.handle(id);
    await app.unuse("tilia-photo-renderer"); await settle();
    const removed = { url: f.revoked.length, selected: !!app.selection.getCurrent(), state: app.rendering.getStatus(id).state };
    await app.use("tilia-photo-renderer"); await settle();
    const active = app.rendering.getStatus(id).state;
    await app.entries.remove(id); await settle();
    return { hidden, sameToken: fresh.token === old.token, adapterRemoved,
      changedToken: renewed.token !== fresh.token, removed, active,
      urls: [f.created.length, f.revoked.length], selection: app.selection.getCurrent() };
  });
  expect(lifecycle).toMatchObject({ hidden: { invalid: true, selected: true }, sameToken: true,
    adapterRemoved: { popup: 0, rings: 1, selected: true }, changedToken: true,
    removed: { url: 0, selected: true, state: "unavailable" }, active: "active", urls: [1, 1], selection: null });
  await page.locator('input[type="file"]').setInputFiles(gpsPhoto);
  await page.locator(".leaflet-marker-icon").click();
  await expect(page.locator(".leaflet-popup")).toHaveCount(1);
  const terminated = await page.evaluate(async () => {
    const f = window.phase4g, id = f.app.entries.list()[0].id, handle = f.handle(id);
    let currentAtAbort;
    handle.signal.addEventListener("abort", () => { currentAtAbort = handle.isCurrent(); });
    await f.terminateRendering();
    return { currentAtAbort, aborted: handle.signal.aborted,
      popups: document.querySelectorAll(".leaflet-popup").length,
      rings: f.ringCount(),
      selected: !!f.app.selection.getCurrent(), urls: f.revoked.length };
  });
  expect(terminated).toEqual({ currentAtAbort: false, aborted: true, popups: 0, rings: 0, selected: true, urls: 1 });
  expect(errors).toEqual([]);
});

test("Phase 4G timestamp-only Photo tree selection, three settings modes and UI lifetimes", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/tests/fixtures/phase-4g/");
  await expect(page.locator("body")).toHaveAttribute("data-phase4g-ready", "true");
  await page.locator('input[type="file"]').setInputFiles(timestampPhoto);
  await expect(page.locator(".tilia-status-text")).toContainText("IMG_2892.JPG");
  await expect(page.locator(".leaflet-marker-icon")).toHaveCount(0);
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page.getByRole("button", { name: "IMG_2892.JPG", exact: true }).click();
  expect(await page.evaluate(() => window.phase4g.app.selection.getCurrent()?.ref)).toEqual({ kind: "photo" });
  await expect(page.locator(".leaflet-popup")).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const select = page.locator(".tilia-photo-time-mode-select");
  await expect(select.locator("option")).toHaveCount(4);
  for (const mode of ["local", "utc", "auto"]) {
    await select.selectOption(mode);
    await expect(select).toHaveValue(mode);
  }
  const result = await page.evaluate(async () => {
    const app = window.phase4g.app, id = app.entries.list()[0].id;
    for (const plugin of ["tilia-photo-ui", "tilia-settings", "tilia-layers", "tilia-panel", "tilia-map-selection-presenter"])
      await app.unuse(plugin);
    const state = { entries: app.entries.list().length, selected: !!app.selection.getCurrent(),
      inferred: app.domains.photo.get(id).snapshot.derived.inferredLocation,
      urlCount: window.phase4g.revoked.length };
    for (const plugin of ["tilia-layers", "tilia-settings", "tilia-photo-ui", "tilia-map-selection-presenter"])
      await app.use(plugin);
    return state;
  });
  expect(result).toEqual({ entries: 1, selected: true, inferred: null, urlCount: 0 });
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await expect(page.locator(".tilia-layer-name")).toHaveText("IMG_2892.JPG");
  expect(errors).toEqual([]);
});

test("Phase 4G optional Photo/JPEG roles load EXIF only for first handled JPEG and accept native cross-realm signals", async ({ page }) => {
  const requested = [];
  page.on("request", (request) => requested.push(request.url()));
  await page.goto("/tests/fixtures/phase-4g/?optional");
  await expect(page.locator("body")).toHaveAttribute("data-phase4g-ready", "true");
  const install = await page.evaluate(async () => {
    const app = window.phase4g.app;
    window.optional4g = app;
    for (const id of ["tilia-photo-domain", "tilia-photo-renderer", "tilia-photo-ui", "tilia-jpeg-input"])
      await app.use(id);
    const frame = document.createElement("iframe"); document.body.appendChild(frame);
    const controller = new frame.contentWindow.AbortController();
    controller.abort("other realm");
    let code;
    try { await app.domains.photo.create({}, { signal: controller.signal }); } catch (error) { code = error.code; }
    frame.remove();
    return code;
  });
  expect(install).toBe("ENTRY_CREATION_ABORTED");
  expect(requested.filter((url) => /photo\/exif|exifr/.test(url))).toEqual([]);
  await page.evaluate(async () => {
    const blob = await (await fetch("/tests/fixtures/photo-exif.jpg")).blob();
    await window.optional4g.load(new File([blob], "IMG_2889.JPG", { type: "image/jpeg" }));
  });
  expect(requested.some((url) => /photo\/exif\.js/.test(url))).toBe(true);
  expect(requested.some((url) => /exifr/.test(url))).toBe(true);
});
