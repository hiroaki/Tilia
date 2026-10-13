import { expect, test } from "@playwright/test";

test("Phase 4E production selection works without domain rendering or presentation", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/tests/fixtures/phase-4e/");
  await expect(page.locator("body")).toHaveAttribute("data-phase4e-ready", "true");
  const result = await page.evaluate(async () => {
    const app = window.phase4eApp;
    const initialPlugins = app.listPlugins();
    const gpx = await app.domains.gpx.create({
      name: "selected.gpx", tracks: [{ segments: [{ points: [{ lat: 35, lon: 135, elevation: 10, timestamp: 1000 }] }] }],
      routes: [], waypoints: [],
    });
    const photo = await app.domains.photo.create({ data: { name: "selected.jpg" }, blob: new Blob(["photo"]) });
    const changes = [];
    const subscription = app.selection.subscribe((event) => changes.push(event.reason));
    const initial = { selection: app.selection.getCurrent(), notifications: changes.length };
    const candidate = app.domains.gpx.selection.createCandidate(gpx.id, {
      kind: "track-point", trackIndex: 0, segmentIndex: 0, pointIndex: 0,
    });
    const selected = await app.selection.request(candidate);
    const resolved = app.domains.gpx.selection.resolve(gpx.id, selected.ref);
    await app.selection.request(candidate);
    const equalNotifications = changes.length;
    await app.entries.setVisible(gpx.id, false);
    const hiddenGpxPreserved = app.selection.getCurrent() === selected;
    const other = await app.selection.request(app.domains.photo.selection.createCandidate(photo.id));
    await app.entries.setVisible(photo.id, false);
    const hiddenPhotoPreserved = app.selection.getCurrent() === other;
    await app.entries.remove(gpx.id);
    const unrelatedRemovalPreserved = app.selection.getCurrent() === other;
    const photoRevision = app.domains.photo.get(photo.id).revision;
    await app.entries.remove(photo.id);
    const removedSelection = app.selection.getCurrent();
    await app.selection.clear();
    subscription.unsubscribe();
    await app.unuse("tilia-photo-domain");
    await app.unuse("tilia-gpx-domain");
    return {
      initialPlugins, initial, resolved, equalNotifications, changes,
      hiddenGpxPreserved, hiddenPhotoPreserved, unrelatedRemovalPreserved,
      removedSelection, photoRevision, remainingEntries: app.entries.list(),
      selectionKeys: Object.keys(selected), ref: selected.ref,
      hasLegacy: ["core", "state", "refreshView", "addRefreshHandler", "subscribeInteractions"].some((key) => key in app),
    };
  });
  expect(result.initialPlugins).toContain("tilia-gpx-domain");
  expect(result.initialPlugins).toContain("tilia-photo-domain");
  expect(result.initial).toEqual({ selection: null, notifications: 0 });
  expect(result.resolved).toMatchObject({ lat: 35, lon: 135 });
  expect(result.ref.revision).toBe(1);
  expect(result.equalNotifications).toBe(1);
  expect(result.hiddenGpxPreserved).toBe(true);
  expect(result.hiddenPhotoPreserved).toBe(true);
  expect(result.unrelatedRemovalPreserved).toBe(true);
  expect(result.photoRevision).toBe(1);
  expect(result.changes).toEqual(["requested", "requested", "entry-removed"]);
  expect(result.selectionKeys).toEqual(["entryId", "domain", "ref"]);
  expect(result.removedSelection).toBeNull();
  expect(result.remainingEntries).toEqual([]);
  expect(result.hasLegacy).toBe(false);
  await expect(page.locator(".leaflet-marker-icon, .leaflet-overlay-pane path, .leaflet-popup")).toHaveCount(0);
  expect(errors).toEqual([]);
});
