import { expect, test } from "@playwright/test";

test("Phase 4D production composition owns headless GPX and Photo semantics", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/tests/fixtures/phase-4d/");
  await expect(page.locator("body")).toHaveAttribute("data-phase4d-ready", "true");

  const result = await page.evaluate(async () => {
    const app = window.phase4dApp;
    const gpx = await app.domains.gpx.create({
      data: {
        name: "headless.gpx",
        tracks: [{ name: "track", segments: [{ points: [{ lat: 35, lon: 135, elevation: 10, timestamp: 1_000 }] }] }],
        routes: [],
        waypoints: [],
      },
      preferences: { stylePresetId: "default" },
    });
    const gpxInitial = app.domains.gpx.get(gpx.id);
    const gpxChanged = await app.domains.gpx.setTrackVisibility(
      gpx.id,
      { trackIndex: 0, visible: false },
      { expectedRevision: gpxInitial.revision },
    );
    await app.entries.setVisible(gpx.id, false);
    const gpxAfterVisibility = app.domains.gpx.get(gpx.id);

    const photo = await app.domains.photo.create({
      data: {
        name: "headless.jpg",
        coordinate: { lat: 35, lon: 135 },
        capturedAt: 1_700_000_000_000,
        source: { mediaType: "image/jpeg", size: 5 },
      },
      preferences: { requestedTimeMode: "auto" },
      blob: new Blob(["photo"], { type: "image/jpeg" }),
    });
    const photoInitial = app.domains.photo.get(photo.id);
    const photoChanged = await app.domains.photo.setRequestedTimeMode(
      photo.id,
      "utc",
      { expectedRevision: photoInitial.revision },
    );
    await app.entries.setVisible(photo.id, false);
    const photoAfterVisibility = app.domains.photo.get(photo.id);
    const publicState = JSON.stringify({ entries: app.entries.list(), photo: photoAfterVisibility });

    let blockedCode = null;
    try {
      await app.unuse("tilia-photo-domain");
    } catch (error) {
      blockedCode = error.code;
    }

    const entriesBeforeDelete = app.entries.list();
    await app.entries.remove(photo.id);
    await app.entries.remove(gpx.id);
    const entriesAfterDelete = app.entries.list();
    await app.unuse("tilia-photo-domain");
    await app.unuse("tilia-gpx-domain");

    return {
      plugins: app.listPlugins(),
      hasLegacyAuthority: ["core", "state", "refreshView", "addRefreshHandler", "subscribeInteractions"]
        .some((key) => key in app),
      gpxRevision: [gpxInitial.revision, gpxChanged.revision, gpxAfterVisibility.revision],
      photoRevision: [photoInitial.revision, photoChanged.revision, photoAfterVisibility.revision],
      entriesBeforeDelete: entriesBeforeDelete.map((entry) => ({ ...entry, domain: entry.domain.id })),
      entriesAfterDelete: entriesAfterDelete.map((entry) => ({ ...entry, domain: entry.domain.id })),
      publicState,
      blockedCode,
      resources: window.phase4dResourceLog,
    };
  });

  expect(result.hasLegacyAuthority).toBe(false);
  expect(result.gpxRevision).toEqual([1, 2, 2]);
  expect(result.photoRevision).toEqual([1, 2, 2]);
  expect(result.entriesBeforeDelete).toEqual([
    { id: 1, domain: "gpx", visible: false },
    { id: 2, domain: "photo", visible: false },
  ]);
  expect(result.entriesAfterDelete).toEqual([]);
  expect(result.publicState).not.toMatch(/previewUrl|blob:phase-4d/);
  expect(result.blockedCode).toBe("DOMAIN_PROVIDER_IN_USE");
  expect(result.resources).toEqual({
    created: [{ url: "blob:phase-4d-1", size: 5 }],
    revoked: ["blob:phase-4d-1"],
  });
  expect(result.plugins).not.toContain("tilia-gpx-domain");
  expect(result.plugins).not.toContain("tilia-photo-domain");
  expect(errors).toEqual([]);
});
