import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("leaflet", () => import("./helpers/leaflet-ui.js"));
import { uiFixture, settle } from "./helpers/production-ui.js";
import { gpxDomainKey } from "../src/domains/keys.js";
import { Layer } from "./helpers/leaflet-ui.js";
let f;
afterEach(async () => { vi.restoreAllMocks(); await f?.close(); f = null; });
const data = { name: "source", tracks: [{ segments: [{ points: [{ lat:0,lon:0 },{lat:1,lon:1}] }] }, { segments: [{ points: [{lat:2,lon:2},{lat:3,lon:3}] }] }] };
async function setup(renderer = false) {
  f = await uiFixture(["tilia-gpx-domain", ...(renderer ? ["tilia-gpx-renderer"] : [])]);
  const entry = await f.app.domains.gpx.create(data); await settle();
  return entry;
}
const suppress = (entry, scope, trackIndex = 0, expectedRevision = f.app.domains.gpx.get(entry.id).revision) => f.context.rendering.suppress({
  entryId:entry.id,domain:gpxDomainKey,target:{kind:"track",trackIndex},expectedRevision,scope });
const snapshot = () => f.context.rendering.getSuppressionSnapshot();
describe("approved 4J-A temporary presentation suppression contract", () => {
  it("reads without renderer and emits only first/final overlap transitions, with frozen canonical refs", async () => {
    const entry = await setup(), events = [], a = f.context.scope.child(), b = f.context.scope.child();
    f.context.rendering.subscribeSuppression(value => events.push(value));
    const one = suppress(entry,a), two = suppress(entry,b);
    expect(events.map(value => value.length)).toEqual([0,1]); expect(Object.isFrozen(snapshot()[0].ref)).toBe(true);
    expect(snapshot()[0]).toMatchObject({entryId:entry.id,domain:gpxDomainKey,ref:{kind:"track",trackIndex:0,revision:1}});
    await one.dispose(); expect(snapshot()).toHaveLength(1); expect(events).toHaveLength(2);
    await b.dispose(); expect(events.map(value => value.length)).toEqual([0,1,0]); await two.dispose(); expect(events).toHaveLength(3);
    expect(f.app.domains.gpx.get(entry.id).revision).toBe(1); expect(f.app.selection.getCurrent()).toBeNull();
  });
  it("serializes mutations and nested subscriptions from initial delivery with no pre-registration replay", async () => {
    const entry = await setup(), scope = f.context.scope.child(), order = [];
    let lease, subscription;
    f.context.rendering.subscribeSuppression(value => {
      order.push(`a:${value.length}`);
      if (order.length === 1) {
        lease = suppress(entry,scope);
        subscription = f.context.rendering.subscribeSuppression(current => order.push(`b:${current.length}`));
        void lease.dispose();
      }
    });
    expect(order).toEqual(["a:0","a:1","b:1","a:0","b:0"]);
    subscription.unsubscribe(); suppress(entry,scope); expect(order.at(-1)).toBe("a:1");
  });
  it("isolates throwing listeners and suppresses queued/dead/unsubscribed callbacks", async () => {
    const entry = await setup(), scope = f.context.scope.child(), listener = vi.fn();
    f.context.rendering.subscribeSuppression(() => { throw new Error("listener failed"); });
    const sub = f.context.rendering.subscribeSuppression(listener,{scope,emitCurrent:false}); sub.unsubscribe();
    suppress(entry,f.context.scope.child()); expect(listener).not.toHaveBeenCalled(); await scope.dispose();
    expect(() => f.context.rendering.subscribeSuppression(listener,{scope})).toThrow();
  });
  it("reads owner abort liveness before the suppression abort listener and respects another live lease", async () => {
    const entry = await setup(), a = f.context.scope.child(), b = f.context.scope.child(); let during;
    a.signal.addEventListener("abort", () => { during = snapshot(); });
    suppress(entry,a); const remaining = suppress(entry,b); await a.dispose(); expect(during).toHaveLength(1);
    let final; b.signal.addEventListener("abort", () => { final = snapshot(); }); await b.dispose(); expect(final).toHaveLength(0); await remaining.dispose();
  });
  it("reconciles revisions and reveals current persistent preferences, not initial visibility", async () => {
    const entry = await setup(true), scope = f.context.scope.child();
    const selected = f.app.domains.gpx.selection.createCandidate(entry.id,{kind:"track",trackIndex:0}); await f.app.selection.request(selected);
    const lease = suppress(entry,scope); expect(f.app.selection.getCurrent().ref.trackIndex).toBe(0);
    await f.app.domains.gpx.setTrackVisibility(entry.id,{trackIndex:0,visible:false},{expectedRevision:1}); await settle();
    expect(snapshot()[0].ref.revision).toBe(2); await lease.dispose(); await settle();
    const tracks = [...f.map.layers].filter(layer => Array.isArray(layer.point)); expect(tracks).toHaveLength(1);
    expect(f.app.domains.gpx.get(entry.id).snapshot.preferences.trackVisibility[0]).toBe(false);
  });
  it("invalidates identical-shape structural replacements and stale lease disposal cannot release a new lease", async () => {
    const entry = await setup(), scope = f.context.scope.child(), old = suppress(entry,scope);
    await f.app.domains.gpx.replaceData(entry.id,{...data,name:"replacement"},{expectedRevision:1}); expect(snapshot()).toHaveLength(0);
    const fresh = suppress(entry,scope); await old.dispose(); expect(snapshot()).toHaveLength(1); expect(snapshot()[0].ref.revision).toBe(2); await fresh.dispose();
  });
  it("deletion and clear drop state without closing independent draft owners", async () => {
    const entry = await setup(), scope = f.context.scope.child(); suppress(entry,scope);
    await f.app.entries.remove(entry.id); expect(scope.alive).toBe(true); expect(snapshot()).toEqual([]);
    const second = await f.app.domains.gpx.create(data); suppress(second,scope); await f.app.entries.clear(); expect(snapshot()).toEqual([]);
  });
  it("keeps leases over renderer uninstall/reinstall; suppressed layers cannot select or resolve presentation", async () => {
    const entry = await setup(true), before = [...f.map.layers].filter(layer => Array.isArray(layer.point)), scope = f.context.scope.child();
    const handle = f.context.presentation.resolve(entry.id,{kind:"track",trackIndex:0,revision:1}); expect(handle?.isCurrent()).toBe(true);
    const lease = suppress(entry,scope); expect(handle.signal.aborted).toBe(true);
    expect(f.context.presentation.resolve(entry.id,{kind:"track",trackIndex:0,revision:1})).toBeNull();
    before[0].fire("click",{latlng:{lat:0,lng:0},originalEvent:{stopPropagation(){}}}); await settle(); expect(f.app.selection.getCurrent()).toBeNull();
    await f.app.unuse("tilia-gpx-renderer"); expect(snapshot()).toHaveLength(1); await f.app.use("tilia-gpx-renderer"); await settle();
    expect([...f.map.layers].filter(layer => Array.isArray(layer.point))).toHaveLength(1);
    await lease.dispose(); expect([...f.map.layers].filter(layer => Array.isArray(layer.point))).toHaveLength(2);
  });
  it("rechecks suppression after callback-bearing candidate attachment and releases during another attachment", async () => {
    const entry = await setup(), scope = f.context.scope.child(); let lease = suppress(entry,scope), called = false;
    const original = Layer.prototype.addTo;
    vi.spyOn(Layer.prototype,"addTo").mockImplementation(function(map) {
      const result = original.call(this,map);
      if (Array.isArray(this.point) && !called) { called = true; void lease.dispose(); }
      return result;
    });
    await f.app.use("tilia-gpx-renderer"); await settle(); expect(snapshot()).toEqual([]);
    expect([...f.map.layers].filter(layer => Array.isArray(layer.point))).toHaveLength(2);
    called = false;
    vi.spyOn(Layer.prototype,"addTo").mockImplementation(function(map) {
      const result = original.call(this,map);
      if (Array.isArray(this.point) && !called) { called = true; lease = suppress(entry,scope); }
      return result;
    });
    await f.app.unuse("tilia-gpx-renderer"); await f.app.use("tilia-gpx-renderer"); await settle();
    expect([...f.map.layers].filter(layer => Array.isArray(layer.point))).toHaveLength(1);
  });
  it("rejects foreign scopes, invalid targets and stale revisions without state changes", async () => {
    const entry = await setup();
    expect(() => suppress(entry,{},0)).toThrow(); expect(() => suppress(entry,f.context.scope.child(),99)).toThrow();
    expect(() => suppress(entry,f.context.scope.child(),0,999)).toThrow(); expect(snapshot()).toEqual([]);
  });
});
