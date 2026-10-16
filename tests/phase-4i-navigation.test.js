import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("leaflet", () => import("./helpers/leaflet-ui.js"));
import { uiFixture, byClass, settle } from "./helpers/production-ui.js";
import { mountGpxRow } from "../src/gpx/ui.js";
import { mountPhotoRow } from "../src/photo/ui.js";

let f, release;
afterEach(async () => { release?.(); release = null; await f?.close(); f = null; });
const data = () => ({
  name: "bounds.gpx",
  tracks: [
    { name: "A", segments: [
      { points: [{ lat: 1, lon: 10 }, { lat: 2, lon: 20 }] },
      { points: [{ lat: 3, lon: 30 }] },
    ] },
    { name: "B", segments: [{ points: [{ lat: 4, lon: 40 }] }] },
  ],
  routes: [{ name: "R", points: [{ lat: 5, lon: 50 }, { lat: 6, lon: 60 }] }],
  waypoints: [{ name: "W", lat: 7, lon: 70 }],
});
const fitOptions = { padding: [20, 20], maxZoom: 18 };
const createPhoto = (coordinate = { lat: 35, lon: 135 }) => f.app.domains.photo.create({
  data: { name: "photo.jpg", coordinate, capturedAt: 0 }, blob: new Blob(["photo"]),
});

describe("Phase 4I explicit semantic navigation", () => {
  it("fits document/track/segment/route extents when hidden and without a renderer", async () => {
    f = await uiFixture(["tilia-gpx-ui", "tilia-layers"]);
    const entry = await f.app.domains.gpx.create(data());
    await f.app.entries.setVisible(entry.id, false);
    await f.app.domains.gpx.setCategoryVisibility(entry.id, { category: "tracks", visible: false }, { expectedRevision: 1 });
    f.click("Layers"); await settle();
    const buttons = byClass(f.map.container, "tilia-gpx-fit");
    const bounds = [
      [[1, 10], [7, 70]], [[1, 10], [3, 30]], [[1, 10], [2, 20]],
      [[3, 30], [3, 30]], [[4, 40], [4, 40]], [[4, 40], [4, 40]], [[5, 50], [6, 60]],
    ];
    expect(buttons).toHaveLength(bounds.length);
    for (let index = 0; index < buttons.length; index++) {
      buttons[index].click(); await settle();
      expect(f.map.fitBounds).toHaveBeenLastCalledWith(bounds[index], fitOptions);
    }
    expect(f.app.entries.get(entry.id).visible).toBe(false);
    expect(f.app.domains.gpx.get(entry.id).snapshot.preferences.tracksVisible).toBe(false);
    expect(f.app.hasPlugin("tilia-gpx-renderer")).toBe(false);
    expect(f.app.selection.getCurrent()).toBeNull();
    byClass(f.map.container, "tilia-gpx-track")[0].children.find(n => n.classList.contains("tilia-gpx-node")).click();
    await settle(); expect(f.map.panTo).not.toHaveBeenCalled();
    const documentButton = byClass(f.map.container, "tilia-layer-name")[0];
    f.map.fitBounds.mockClear(); documentButton.dispatchEvent(new Event("dblclick", { cancelable: true }));
    await settle(); expect(f.map.fitBounds).toHaveBeenCalledWith(bounds[0], fitOptions);
  });

  it("reveals route points and waypoints with canonical selection and lon-to-lng conversion", async () => {
    f = await uiFixture(["tilia-gpx-ui", "tilia-layers"]);
    const entry = await f.app.domains.gpx.create(data());
    f.click("Layers"); await settle();
    const buttons = byClass(f.map.container, "tilia-gpx-reveal"); expect(buttons).toHaveLength(3);
    buttons[1].click(); await settle();
    expect(f.app.selection.getCurrent()).toMatchObject({ entryId: entry.id, ref: { kind: "route-point", routeIndex: 0, pointIndex: 1, revision: 1 } });
    expect(f.map.panTo).toHaveBeenLastCalledWith({ lat: 6, lng: 60 }, undefined);
    const waypoint = byClass(f.map.container, "tilia-gpx-node").find(n => n.textContent === "W");
    waypoint.dispatchEvent(new Event("dblclick", { cancelable: true })); await settle();
    expect(f.app.selection.getCurrent()).toMatchObject({ entryId: entry.id, ref: { kind: "waypoint", waypointIndex: 0, revision: 1 } });
    expect(f.map.panTo).toHaveBeenLastCalledWith({ lat: 7, lng: 70 }, undefined);
  });

  it("disables empty extents and ignores withdrawn structural controls after replacement", async () => {
    f = await uiFixture(["tilia-gpx-ui", "tilia-layers"]);
    const entry = await f.app.domains.gpx.create(data()); f.click("Layers"); await settle();
    const oldFit = byClass(f.map.container, "tilia-gpx-fit")[1];
    const oldReveal = byClass(f.map.container, "tilia-gpx-reveal")[0];
    await f.app.domains.gpx.replaceData(entry.id, { name: "empty" }, { expectedRevision: 1 }); await settle();
    const fit = byClass(f.map.container, "tilia-gpx-fit");
    expect(fit).toHaveLength(1); expect(fit[0].disabled).toBe(true);
    oldFit.click(); oldReveal.click(); fit[0].click(); await settle();
    expect(f.map.fitBounds).not.toHaveBeenCalled(); expect(f.map.panTo).not.toHaveBeenCalled();
  });

  it("Photo Reveal selects the photo while Fit and single selection have separate camera effects", async () => {
    f = await uiFixture(["tilia-photo-ui", "tilia-layers"]);
    const other = await createPhoto({ lat: 1, lon: 2 }), entry = await createPhoto();
    await f.app.entries.setVisible(entry.id, false);
    await f.app.selection.request(f.app.domains.photo.selection.createCandidate(other.id));
    f.click("Layers"); await settle();
    byClass(f.map.container, "tilia-photo-fit")[1].click(); await settle();
    expect(f.map.fitBounds).toHaveBeenCalledWith([[35, 135], [35, 135]], fitOptions);
    expect(f.app.selection.getCurrent().entryId).toBe(other.id);
    byClass(f.map.container, "tilia-photo-reveal")[1].click(); await settle();
    expect(f.app.selection.getCurrent()).toMatchObject({ entryId: entry.id, ref: { kind: "photo" } });
    expect(f.map.panTo).toHaveBeenCalledWith({ lat: 35, lng: 135 }, undefined);
    expect(f.app.entries.get(entry.id).visible).toBe(false);
    expect(f.app.hasPlugin("tilia-photo-renderer")).toBe(false);
    f.map.panTo.mockClear();
    byClass(f.map.container, "tilia-layer-name")[0].click(); await settle();
    expect(f.map.panTo).not.toHaveBeenCalled();
    byClass(f.map.container, "tilia-layer-name")[1].dispatchEvent(new Event("dblclick", { cancelable: true })); await settle();
    expect(f.map.panTo).toHaveBeenCalledWith({ lat: 35, lng: 135 }, undefined);
  });

  it("navigates using saved inferred Photo coordinates after the source GPX is removed", async () => {
    f = await uiFixture(["tilia-photo-ui", "tilia-gpx-domain", "tilia-layers"]);
    const track = await f.app.domains.gpx.create({ name: "timeline", tracks: [{ segments: [{ points: [
      { lat: 0, lon: 20, timestamp: 0 }, { lat: 10, lon: 40, timestamp: 10_000 },
    ] }] }] });
    const entry = await f.app.domains.photo.create({ data: { name: "inferred", coordinate: null, capturedAt: 5000 },
      preferences: { requestedTimeMode: "local" }, blob: new Blob(["photo"]) });
    expect(f.app.domains.photo.get(entry.id).snapshot.derived.inferredLocation).toEqual({ lat: 5, lon: 30 });
    await f.app.entries.remove(track.id); f.click("Layers"); await settle();
    byClass(f.map.container, "tilia-photo-fit")[0].click(); await settle();
    expect(f.map.fitBounds).toHaveBeenCalledWith([[5, 30], [5, 30]], fitOptions);
    byClass(f.map.container, "tilia-photo-reveal")[0].click(); await settle();
    expect(f.app.selection.getCurrent().entryId).toBe(entry.id);
    expect(f.map.panTo).toHaveBeenCalledWith({ lat: 5, lng: 30 }, undefined);
  });

  it("Photo without coordinates remains selectable but cannot Fit/Reveal", async () => {
    f = await uiFixture(["tilia-photo-ui", "tilia-layers"]);
    const entry = await createPhoto(null); f.click("Layers"); await settle();
    expect(byClass(f.map.container, "tilia-photo-fit")[0].disabled).toBe(true);
    expect(byClass(f.map.container, "tilia-photo-reveal")[0].disabled).toBe(true);
    byClass(f.map.container, "tilia-photo-reveal")[0].click(); await settle();
    expect(f.map.panTo).not.toHaveBeenCalled(); expect(f.map.fitBounds).not.toHaveBeenCalled();
    byClass(f.map.container, "tilia-layer-name")[0].click(); await settle();
    expect(f.app.selection.getCurrent().entryId).toBe(entry.id);
  });

  it.each(["gpx", "photo"])("%s Reveal suppresses a camera effect after deletion, revision change, selection change or mount close", async (domain) => {
    f = await uiFixture([domain === "gpx" ? "tilia-gpx-ui" : "tilia-photo-ui"]);
    for (const race of ["delete", "revision", "selection", "close"]) {
      const entry = domain === "gpx" ? await f.app.domains.gpx.create(data()) : await createPhoto();
      const other = domain === "gpx" ? await f.app.domains.gpx.create(data()) : await createPhoto({ lat: 8, lon: 9 });
      const scope = f.context.scope.child({ label: "navigation-race" }), container = f.doc.createElement("div"); f.doc.body.appendChild(container);
      const gate = new Promise(resolve => { release = resolve; });
      let requested;
      const selection = { ...f.context.selection, async request(candidate) {
        requested = await f.context.selection.request(candidate); await gate; return requested;
      } };
      // Issue and request candidates through the same observer consumer Scope.
      // Hold request settlement to exercise the continuation with real stores.
      const mount = domain === "gpx" ? mountGpxRow : mountPhotoRow;
      mount({ container, scope, entry, selection, entries: f.context.entries,
        gpx: f.context.domains.gpx, photo: f.context.domains.photo, map: f.context.map, report: vi.fn() });
      byClass(container, domain === "gpx" ? "tilia-gpx-reveal" : "tilia-photo-reveal")[0].click(); await settle();
      expect(requested?.entryId).toBe(entry.id);
      if (race === "delete") await f.app.entries.remove(entry.id);
      else if (race === "revision") {
        if (domain === "gpx") await f.app.domains.gpx.replaceData(entry.id, { ...data(), name: "replaced" }, { expectedRevision: 1 });
        else await f.app.domains.photo.replaceData(entry.id, { ...f.app.domains.photo.get(entry.id).snapshot.data, coordinate: { lat: 8, lon: 9 } }, { expectedRevision: 1 });
      } else if (race === "selection") {
        const candidate = domain === "gpx" ? f.app.domains.gpx.selection.createCandidate(other.id, { kind: "document" }) : f.app.domains.photo.selection.createCandidate(other.id);
        await f.app.selection.request(candidate);
      } else await scope.dispose();
      release(); release = null; await settle();
      expect(f.map.panTo).not.toHaveBeenCalled(); await scope.dispose(); container.remove();
    }
  });
});
