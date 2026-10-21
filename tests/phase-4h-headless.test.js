import { expect, it } from "vitest";
import { createSemanticFoundation } from "../src/semantic-foundation.js";
import { createApplicationSemanticApi, createSemanticCapabilityFactories } from "../src/semantic-capabilities.js";
import { createPluginRuntime } from "../src/plugins/runtime/index.js";
import { createServiceRegistry } from "../src/extensions/services.js";
import gpx from "../src/plugins/domains/gpx.js";
import photo from "../src/plugins/domains/photo.js";
import { gpxQueryServiceKey } from "../src/plugins/contracts/gpx-query.js";
const tick = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const data = (name = "track") => ({ name, tracks: [{ segments: [{ points: [{ lat: 0, lon: 0, timestamp: 0 }, { lat: 10, lon: 0, timestamp: 10000 }] }] }] });
async function fixture(dispose = () => {}, revoke = () => {}) {
  const diagnostics = [], foundation = await createSemanticFoundation({ onError: (e) => diagnostics.push(e) });
  const services = createServiceRegistry();
  const runtime = createPluginRuntime({ catalog: [
    { id: gpx.id, requires: [], load: async () => ({ default: { ...gpx, setup(context) {
      gpx.setup({ ...context, domains: { ...context.domains, provide(key, provider) { context.domains.provide(key, { ...provider, async prepareCreate(input) { return { ...await provider.prepareCreate(input), dispose: () => dispose(input.value.name) }; } }); } } });
    } } }) },
    { id: photo.id, requires: [], load: async () => ({ default: photo }) },
  ], capabilityFactories: { ...createSemanticCapabilityFactories(foundation), services: (input) => services.createFacade(input) } });
  await runtime.use(gpx.id); await runtime.use(photo.id, { createObjectURL: () => "blob:photo", revokeObjectURL: revoke });
  let context; await runtime.use({ id: "x-headless-4h", setup(value) { context = value; } });
  return { foundation, runtime, context, diagnostics, api: createApplicationSemanticApi(foundation) };
}
it("GPX cleanup failure and retry retain withdrawn authority, provider lease and saved Photo estimate", async () => {
  let fail = true;
  const f = await fixture(() => { if (fail) throw new Error("GPX cleanup failed"); });
  const track = await f.api.domains.gpx.create(data());
  const image = await f.api.domains.photo.create({ capturedAt: 5000 });
  const saved = f.api.domains.photo.get(image.id).snapshot;
  await f.api.selection.request(f.api.domains.gpx.selection.createCandidate(track.id, { kind: "track", trackIndex: 0 }));
  const events = []; f.api.entries.subscribe((e) => events.push(e.type), { emitCurrent: false });
  await expect(f.api.entries.remove(track.id)).rejects.toMatchObject({ code: "SEMANTIC_CLEANUP_FAILED", committed: true });
  expect(f.api.entries.get(track.id)).toBeNull(); expect(f.api.selection.getCurrent()).toBeNull();
  expect(f.context.services.require(gpxQueryServiceKey).captureTimeline().points).toEqual([]);
  expect(f.api.domains.photo.get(image.id).snapshot).toBe(saved); expect(events).toEqual(["removed"]);
  await expect(f.runtime.unuse(gpx.id)).rejects.toBeDefined();
  fail = false; await f.foundation.entries.retryCleanup(f.foundation.scope, track.id);
  expect(events).toEqual(["removed"]); expect(f.api.domains.photo.get(image.id).snapshot).toBe(saved);
  await f.runtime.unuse(gpx.id); await f.api.entries.remove(image.id);
  await f.runtime.destroy(); await f.foundation.dispose();
});
it("clear retains sequential reverse deletion, rejects updates during pending cleanup and emits only settled batch", async () => {
  let release; const gate = new Promise((r) => { release = r; }); const order = [];
  const f = await fixture((name) => { order.push(name); if (name === "last") return gate; }, () => order.push("photo"));
  await f.api.domains.gpx.create(data("first"));
  const image = await f.api.domains.photo.create({ data: { capturedAt: 5000 }, blob: new Blob(["photo"]) });
  const last = await f.api.domains.gpx.create(data("last"));
  const events = []; f.api.entries.subscribe((e) => events.push(e.type), { emitCurrent: false });
  const clearing = f.foundation.entries.clear(f.foundation.scope); await tick();
  expect(f.api.entries.get(last.id)).toBeNull(); expect(f.api.entries.get(image.id)).not.toBeNull();
  expect(f.api.entries.list()).toHaveLength(2); expect(order).toEqual(["last"]); expect(events).toEqual([]);
  expect(() => f.api.domains.photo.setRequestedTimeMode(image.id, "utc", { expectedRevision: 1 })).toThrowError(expect.objectContaining({ code: "ENTRY_REMOVING" }));
  release(); await clearing;
  expect(order).toEqual(["last", "photo", "first"]); expect(events).toEqual(["cleared"]); expect(f.api.entries.list()).toEqual([]);
  await f.runtime.destroy(); await f.foundation.dispose();
});
