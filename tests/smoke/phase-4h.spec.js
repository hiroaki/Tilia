import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { mockPhotoExif, timestampPhoto } from "../helpers/photo-exif.js";

test.beforeEach(async ({ page }) => mockPhotoExif(page));
const helper = resolve(import.meta.dirname, "../fixtures/img-2892-auto-helper.gpx");
const route = resolve(import.meta.dirname, "../fixtures/sample-route.gpx");
async function ready(page) { await page.goto("/tests/fixtures/phase-4h/"); await expect(page.locator("body")).toHaveAttribute("data-phase4h-ready", "true"); }

test("Phase 4H real GPX file, numbered route click, tree selection, style/visibility, independent popup/highlight and removal", async ({ page }) => {
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  await page.locator('input[type="file"]').setInputFiles(route);
  await expect(page.locator(".tilia-status-text")).toContainText("sample-route.gpx");
  await expect(page.locator(".tilia-route-point-marker")).toHaveCount(2);
  await page.locator(".tilia-route-point-marker").first().click();
  await expect(page.locator(".leaflet-popup")).toContainText("Route start");
  expect(await page.evaluate(() => window.phase4h.app.selection.getCurrent().ref)).toMatchObject({ kind: "route-point", routeIndex: 0, pointIndex: 0 });
  await page.locator(".leaflet-popup-close-button").click();
  await expect(page.locator(".leaflet-popup")).toHaveCount(0);
  expect(await page.evaluate(() => { const f = window.phase4h; let crosshairs = 0; f.map.eachLayer((l) => { if (l.options.icon?.options.className === "tilia-selection-crosshair") crosshairs++; }); return { selected: !!f.app.selection.getCurrent(), crosshairs }; })).toEqual({ selected: true, crosshairs: 1 });
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page.getByRole("button", { name: "Scenic route", exact: true }).click();
  await expect(page.locator(".leaflet-popup")).toContainText("Type: route");
  const state = await page.evaluate(async () => {
    const f = window.phase4h, app = f.app, id = app.entries.list()[0].id;
    const ref = app.selection.getCurrent().ref, handle = f.handle(id, ref);
    await app.domains.gpx.setStylePreset(id, "magenta", { expectedRevision: 1 });
    await new Promise((r) => setTimeout(r, 20));
    const changed = { revision: app.domains.gpx.get(id).revision, oldAborted: handle.signal.aborted, oldCurrent: handle.isCurrent(), selectionRevision: app.selection.getCurrent().ref.revision };
    await app.entries.setVisible(id, false);
    const hidden = { selected: !!app.selection.getCurrent(), handle: f.handle(id, app.selection.getCurrent().ref) };
    await app.entries.setVisible(id, true);
    return { changed, hidden: { selected: hidden.selected, noHandle: hidden.handle === null } };
  });
  expect(state).toEqual({ changed: { revision: 2, oldAborted: true, oldCurrent: false, selectionRevision: 2 }, hidden: { selected: true, noHandle: true } });
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.locator(".tilia-route-point-marker")).toHaveCount(0);
  expect(await page.evaluate(() => window.phase4h.app.selection.getCurrent())).toBeNull();
  expect(errors).toEqual([]);
});

test("Phase 4H real EXIF inference is one-shot and independent of GPX renderer, deletion, service availability and preview replacement", async ({ page }) => {
  const errors = []; page.on("pageerror", (error) => errors.push(error.message)); await ready(page);
  await page.evaluate(() => window.phase4h.app.unuse("tilia-gpx-renderer"));
  await page.locator('input[type="file"]').setInputFiles([{ name: "img-2892-auto-helper.gpx", mimeType: "application/gpx+xml", buffer: readFileSync(helper) }, timestampPhoto]);
  await expect(page.locator(".tilia-status-text")).toContainText("gpx-time-inference");
  const saved = await page.evaluate(() => {
    const f = window.phase4h, entry = f.app.entries.list().find((e) => e.domain.id === "photo");
    const view = f.app.domains.photo.get(entry.id); f.map.setView([view.snapshot.derived.inferredLocation.lat, view.snapshot.derived.inferredLocation.lon], 13, { animate: false });
    return { id: entry.id, revision: view.revision, snapshot: view.snapshot };
  });
  expect(saved.snapshot.data.coordinate).toBeNull(); expect(saved.snapshot.derived.locationSource).toBe("gpx-time-inference");
  await page.locator(".leaflet-marker-icon").click(); await expect(page.locator(".leaflet-popup")).toContainText("gpx-time-inference");
  const retained = await page.evaluate(async () => {
    const f = window.phase4h, app = f.app;
    const gpx = app.entries.list().find((e) => e.domain.id === "gpx"), image = app.entries.list().find((e) => e.domain.id === "photo");
    const old = app.domains.photo.get(image.id), preview = app.domains.photo.getPreview(image.id);
    await app.domains.gpx.replaceData(gpx.id, { tracks: [] }, { expectedRevision: 1 });
    await app.entries.remove(gpx.id); await app.unuse("tilia-gpx-input"); await app.unuse("tilia-gpx-ui"); await app.unuse("tilia-gpx-domain");
    const unchanged = app.domains.photo.get(image.id).snapshot === old.snapshot;
    let retryFailed = false; try { await app.domains.photo.recomputeDerived(image.id, undefined, { expectedRevision: 1 }); } catch { retryFailed = true; }
    await app.domains.photo.replaceData(image.id, { ...old.snapshot.data, blob: new Blob(["replacement"], { type: "image/jpeg" }) }, { expectedRevision: 1 });
    return { unchanged, retryFailed, resourceSnapshotSame: app.domains.photo.get(image.id).snapshot === old.snapshot,
      revision: app.domains.photo.get(image.id).revision, oldPreviewAborted: preview.signal.aborted, urls: [f.created.length, f.revoked.length] };
  });
  expect(retained).toEqual({ unchanged: true, retryFailed: true, resourceSnapshotSame: true, revision: 1, oldPreviewAborted: true, urls: [2, 1] });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const select = page.locator(".tilia-photo-time-mode-select"); await expect(select.locator("option")).toHaveCount(4);
  await select.selectOption("utc"); await expect(select).toHaveValue("auto");
  expect(await page.evaluate(() => window.phase4h.app.domains.photo.get(window.phase4h.app.entries.list()[0].id).revision)).toBe(1);
  expect(errors).toEqual([]);
});

test("Phase 4H newer-revision renderer failure withdraws stale geometry and recovers without losing semantic selection", async ({ page }) => {
  const errors = []; page.on("pageerror", (e) => errors.push(e.message)); await ready(page);
  await page.locator('input[type="file"]').setInputFiles(helper); await expect(page.locator(".tilia-status-text")).toContainText("img-2892");
  const result = await page.evaluate(async () => {
    const f = window.phase4h, app = f.app, id = app.entries.list()[0].id;
    const settle = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
    await app.selection.request(app.domains.gpx.selection.createCandidate(id, { kind: "track", trackIndex: 0 })); await settle();
    const old = f.handle(id, app.selection.getCurrent().ref), add = f.Polyline.prototype.addTo;
    f.Polyline.prototype.addTo = function () { throw new Error("4H intentional attachment failure"); };
    try { await app.domains.gpx.setStylePreset(id, "indigo", { expectedRevision: 1 }); await settle(); } finally { f.Polyline.prototype.addTo = add; }
    let geometry = 0; f.map.eachLayer((l) => { if (l instanceof f.Polyline) geometry++; });
    const failed = { state: app.rendering.getStatus(id).state, geometry, aborted: old.signal.aborted, current: old.isCurrent(), revision: app.selection.getCurrent().ref.revision, popup: document.querySelectorAll(".leaflet-popup").length };
    await app.unuse("tilia-gpx-renderer"); await app.use("tilia-gpx-renderer"); await settle();
    return { failed, recovered: app.rendering.getStatus(id).state, selected: app.selection.getCurrent().entryId === id };
  });
  expect(result).toEqual({ failed: { state: "failed", geometry: 0, aborted: true, current: false, revision: 2, popup: 0 }, recovered: "active", selected: true });
  expect(errors).toEqual([]);
});

test("Phase 4H input cancellation before/after commit and explicit one-time current-bounds fit", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const f = window.phase4h, app = f.app;
    const xml = '<gpx><wpt lat="35" lon="135"/></gpx>';
    let release, started;
    const gate = new Promise((r) => { release = r; }), invoked = new Promise((r) => { started = r; });
    const NativeReader = window.FileReader;
    window.FileReader = class {
      readAsText() { started(); gate.then((text) => { this.result = text; this.onload(); }); }
    };
    const file = new File([xml], "cancel.gpx");
    const pending = app.load(file).catch((e) => e);
    await invoked; await app.unuse("tilia-gpx-input"); release(xml);
    const error = await pending; window.FileReader = NativeReader; const before = { failed: error instanceof Error, entries: app.entries.list().length };
    await app.use("tilia-gpx-input");
    let fit = 0; const original = f.map.fitBounds; f.map.fitBounds = function (...args) { fit++; return original.apply(this, args); };
    await app.load(new File([xml], "fit.gpx"));
    const first = app.entries.list()[0];
    await app.domains.gpx.setStylePreset(first.id, "magenta", { expectedRevision: 1 });
    const successfulFit = fit; await app.entries.remove(first.id); fit = 0;
    let closing;
    const subscription = app.entries.subscribe((event) => { if (event.type === "created") closing = app.unuse("tilia-gpx-input"); }, { emitCurrent: false });
    const afterResult = await app.load(new File([xml], "committed.gpx")).catch((e) => e); await closing; subscription.unsubscribe();
    const entry = app.entries.list()[0];
    await app.domains.gpx.setStylePreset(entry.id, "magenta", { expectedRevision: 1 });
    f.map.fitBounds = original;
    return { before, successfulFit, after: { entryRetained: !!entry, resultOrCancellation: afterResult !== undefined, fit } };
  });
  expect(result.before).toEqual({ failed: true, entries: 0 });
  expect(result.successfulFit).toBe(1);
  expect(result.after.entryRetained).toBe(true); expect(result.after.resultOrCancellation).toBe(true); expect(result.after.fit).toBeLessThanOrEqual(1);
});

test("Phase 4H actual pointer clicks select canonical points from both logical tracks in the target geometry pane", async ({ page }) => {
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  const multi = resolve(import.meta.dirname, "../fixtures/multi-track-elevation.gpx");
  for (const trackIndex of [0, 1]) {
    await ready(page);
    await page.locator('input[type="file"]').setInputFiles(multi);
    const paths = page.locator('[data-tilia-map-band="geometry"] path.leaflet-interactive');
    await expect(paths).toHaveCount(2);
    await paths.nth(trackIndex).click();
    await expect(page.locator(".leaflet-popup")).toBeVisible();
    await expect(page.locator(".leaflet-popup")).toContainText("Track point");
    expect(await page.evaluate(() => window.phase4h.app.selection.getCurrent().ref)).toMatchObject({ kind: "track-point", trackIndex });
    expect(await page.locator('[data-tilia-map-band="selection"] path.leaflet-interactive').count()).toBe(0);
  }
  expect(errors).toEqual([]);
});
