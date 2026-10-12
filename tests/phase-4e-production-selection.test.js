import { describe, expect, it, vi } from "vitest";
import { createApplicationComposition } from "../src/application-composition.js";
const createMachineryApp = options => createApplicationComposition(options).app;

describe("Phase 4E production composition", () => {
  it("selects GPX and Photo through the normal headless factory without rendering or legacy hubs", async () => {
    const app = createMachineryApp({ map: { on() {}, off() {} }, plugins: ["tilia-gpx-domain", "tilia-photo-domain"] });
    await app.whenReady();
    expect(app.listPlugins()).toEqual(["tilia-gpx-domain", "tilia-photo-domain"]);
    for (const removed of ["core", "state", "refreshView", "addRefreshHandler", "subscribeInteractions"]) {
      expect(app).not.toHaveProperty(removed);
    }
    const gpx = await app.domains.gpx.create({
      name: "headless", tracks: [{ segments: [{ points: [{ lat: 35, lon: 135 }] }] }], routes: [], waypoints: [],
    });
    const photo = await app.domains.photo.create({ name: "GPS-less photo" });
    const events = vi.fn();
    const subscription = app.selection.subscribe(events);
    expect(events).not.toHaveBeenCalled();
    const candidate = app.domains.gpx.selection.createCandidate(gpx.id, {
      kind: "track-point", trackIndex: 0, segmentIndex: 0, pointIndex: 0,
    });
    const first = await app.selection.request(candidate);
    await app.selection.request(candidate);
    expect(events).toHaveBeenCalledOnce();
    expect(app.domains.gpx.selection.resolve(gpx.id, first.ref)).toMatchObject({ lat: 35, lon: 135 });
    await app.entries.setVisible(gpx.id, false);
    expect(app.selection.getCurrent()).toBe(first);
    expect(app.domains.gpx.get(gpx.id).revision).toBe(1);
    const second = await app.selection.request(app.domains.photo.selection.createCandidate(photo.id));
    await app.entries.setVisible(photo.id, false);
    await app.entries.remove(gpx.id);
    expect(app.selection.getCurrent()).toBe(second);
    expect(app.domains.photo.get(photo.id).revision).toBe(1);
    await expect(app.unuse("tilia-photo-domain")).rejects.toMatchObject({ code: "DOMAIN_PROVIDER_IN_USE" });
    await app.entries.remove(photo.id);
    expect(app.selection.getCurrent()).toBeNull();
    await app.selection.clear();
    expect(events.mock.calls.map(([event]) => event.reason)).toEqual(["requested", "requested", "entry-removed"]);
    subscription.unsubscribe();
    await app.unuse("tilia-photo-domain");
    await app.unuse("tilia-gpx-domain");
    expect(app.listPlugins()).toEqual([]);
    expect(app.entries.list()).toEqual([]);
  });
});
