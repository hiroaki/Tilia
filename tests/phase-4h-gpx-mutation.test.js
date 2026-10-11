import { expect, it } from "vitest";
import { createSemanticFoundation } from "../src/semantic-foundation.js";
import { createApplicationSemanticApi, createSemanticCapabilityFactories } from "../src/semantic-capabilities.js";
import { createPluginRuntime } from "../src/plugins/runtime/index.js";

it("publishes a point update and remapped selection atomically, rejects stale writes and retains no-op identity", async () => {
  const foundation = await createSemanticFoundation();
  const runtime = createPluginRuntime({ catalog: [{ id: "tilia-gpx-domain", requires: [], load: () => import("../src/plugins/domains/gpx.js") }], capabilityFactories: createSemanticCapabilityFactories(foundation) });
  try {
    await runtime.use("tilia-gpx-domain");
    const api = createApplicationSemanticApi(foundation);
    const entry = await api.domains.gpx.create({ tracks: [{ segments: [{ points: [{ lat: 35, lon: 135, elevation: 0, timestamp: 0 }] }] }] });
    const target = { kind: "track-point", trackIndex: 0, segmentIndex: 0, pointIndex: 0 };
    await api.selection.request(api.domains.gpx.selection.createCandidate(entry.id, target));
    const oldRef = api.selection.getCurrent().ref;
    const publications = [];
    api.entries.subscribe((event) => {
      if (event.type !== "domain-changed") return;
      const current = api.selection.getCurrent();
      publications.push({ revision: event.revision, selectedRevision: current.ref.revision,
        point: api.domains.gpx.selection.resolve(entry.id, current.ref) });
    }, { emitCurrent: false });
    await api.domains.gpx.updatePoint(entry.id, { target: oldRef, patch: { lat: 36, elevation: null } }, { expectedRevision: 1 });
    expect(publications).toEqual([{ revision: 2, selectedRevision: 2, point: { lat: 36, lon: 135, elevation: null, timestamp: 0 } }]);
    expect(api.domains.gpx.selection.resolve(entry.id, oldRef)).toBeNull();
    const snapshot = api.domains.gpx.get(entry.id).snapshot;
    await expect(api.domains.gpx.updatePoint(entry.id, { target: oldRef, patch: { lat: 37 } }, { expectedRevision: 2 })).rejects.toMatchObject({ code: "ENTRY_STALE_REVISION" });
    await expect(api.domains.gpx.updatePoint(entry.id, { target, patch: { lat: 37 } }, { expectedRevision: 1 })).rejects.toMatchObject({ code: "ENTRY_STALE_REVISION" });
    await expect(api.domains.gpx.updatePoint(entry.id, { target, patch: { lon: null } }, { expectedRevision: 2 })).rejects.toMatchObject({ code: "SEMANTIC_INPUT_INVALID" });
    await api.domains.gpx.updatePoint(entry.id, { target, patch: { lat: 36 } }, { expectedRevision: 2 });
    expect(api.domains.gpx.get(entry.id).snapshot).toBe(snapshot);
    expect(api.domains.gpx.get(entry.id).revision).toBe(2);
    expect(publications).toHaveLength(1);
    await api.entries.remove(entry.id);
  } finally {
    await runtime.destroy();
    await foundation.dispose();
  }
});
