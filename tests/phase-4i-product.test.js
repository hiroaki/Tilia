import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("leaflet",()=>import("./helpers/leaflet-ui.js"));
import { uiFixture, byClass, settle } from "./helpers/production-ui.js";
import { builtinPluginCatalog } from "../src/builtins.js";
import * as scopedDom from "../src/ui/scoped-dom.js";
import gpxPlugin from "../src/plugins/domains/gpx.js";
import { elevationLayout, nearestElevationSample } from "../src/gpx/elevation-layout.js";
let f, release;afterEach(async()=>{release?.();release=null;await f?.close();f=null;});
const data=(name="profile.gpx")=>({name,tracks:[{segments:[{points:[{lat:0,lon:0,elevation:10},{lat:1,lon:1,elevation:20}]}]}]});
describe("Phase 4I semantic product behavior",()=>{
 it("keeps generic rows and Settings mounts stable across unrelated/domain changes",async()=>{
  f=await uiFixture(["tilia-gpx-ui","tilia-layers","tilia-settings"]);const a=await f.app.domains.gpx.create(data("a")),b=await f.app.domains.gpx.create(data("b"));f.click("Layers");await settle();const rows=byClass(f.map.container,"tilia-layer-item"),nodes=byClass(f.map.container,"tilia-gpx-tree");await f.app.domains.gpx.setStylePreset(a.id,"amber",{expectedRevision:1});await settle();expect(byClass(f.map.container,"tilia-layer-item")).toEqual(rows);expect(byClass(f.map.container,"tilia-gpx-tree")).toEqual(nodes);
  f.click("Settings");await settle();const sections=byClass(f.map.container,"tilia-entry-settings"),styles=byClass(f.map.container,"tilia-gpx-style-select");await f.app.domains.gpx.setStylePreset(a.id,"magenta",{expectedRevision:2});await settle();expect(byClass(f.map.container,"tilia-entry-settings")).toEqual(sections);expect(styles[0].value).toBe("magenta");expect(styles[1].value).toBe("default");expect(f.app.entries.get(b.id)).not.toBeNull();
 });
 it("withdraws an unselected stale row at action-time absence while external cleanup remains held",async()=>{
  let start;const entered=new Promise(r=>start=r),gate=new Promise(r=>release=r);
  const builtins=builtinPluginCatalog.map(item=>item.id!=="tilia-gpx-domain"?item:{...item,load:async()=>({default:{...gpxPlugin,setup(c){gpxPlugin.setup({...c,domains:{...c.domains,provide(key,provider){c.domains.provide(key,{...provider,async prepareCreate(input){const prepared=await provider.prepareCreate(input);return{...prepared,async dispose(){start();await gate;}};}});}}});}}})});
  f=await uiFixture(["tilia-gpx-ui","tilia-layers"],{builtins});const entry=await f.app.domains.gpx.create(data());f.click("Layers");await settle();const events=[];f.context.entries.subscribe(e=>events.push(e));const toggle=byClass(f.map.container,"tilia-layer-visible")[0],fit=byClass(f.map.container,"tilia-gpx-fit")[0];const removing=f.app.entries.remove(entry.id);await entered;expect(f.app.entries.get(entry.id)).toBeNull();expect(events.some(e=>e.type==="removed")).toBe(false);expect(byClass(f.map.container,"tilia-layer-item")).toHaveLength(1);
  fit.click();toggle.dispatchEvent(new Event("change"));await settle();expect(byClass(f.map.container,"tilia-layer-item")).toHaveLength(0);expect(f.map.fitBounds).not.toHaveBeenCalled();expect(f.app.selection.getCurrent()).toBeNull();release();await removing;expect(events.some(e=>e.type==="removed")).toBe(true);
 });
 it("selects a singleton without renderer, preserves waypoint selection on opening and suppresses automatic pan",async()=>{
  f=await uiFixture(["tilia-elevation"]);const entry=await f.app.domains.gpx.create({name:"single",tracks:[{segments:[{points:[{lat:1,lon:2,elevation:10}]}]}],waypoints:[{lat:3,lon:4}]});f.app.selection.request(f.app.domains.gpx.selection.createCandidate(entry.id,{kind:"waypoint",waypointIndex:0}));const previous=f.app.selection.getCurrent();f.click("Elevation");await settle();expect(f.app.selection.getCurrent()).toBe(previous);
  const chart=byClass(f.map.container,"tilia-elevation-chart")[0];const event=new Event("keydown",{cancelable:true});Object.defineProperty(event,"key",{value:"Enter"});chart.dispatchEvent(event);await settle();expect(f.app.selection.getCurrent()).toMatchObject({entryId:entry.id,ref:{kind:"track-point",revision:1,trackIndex:0,segmentIndex:0,pointIndex:0}});expect(f.map.panTo).not.toHaveBeenCalled();
 });
 it("removes an elevation hover layer when its attachment synchronously replaces the chart", async () => {
  f = await uiFixture(["tilia-elevation", "tilia-gpx-renderer"]);
  const entry = await f.app.domains.gpx.create(data());
  await f.app.selection.request(f.app.domains.gpx.selection.createCandidate(entry.id, { kind: "track", trackIndex: 0 }));
  f.click("Elevation"); await settle();
  const { CircleMarker } = await import("leaflet");
  const original = CircleMarker.prototype.addTo;
  const attach = vi.spyOn(CircleMarker.prototype, "addTo").mockImplementation(function (map) {
    const result = original.call(this, map);
    if (this.options.radius === 7) void f.app.selection.clear();
    return result;
  });
  try {
    const event = new Event("keydown", { cancelable: true }); Object.defineProperty(event, "key", { value: "ArrowRight" });
    byClass(f.map.container, "tilia-elevation-chart")[0].dispatchEvent(event); await settle();
    expect([...f.map.layers].filter(layer => layer.options.radius === 7)).toHaveLength(0);
  } finally { attach.mockRestore(); }
 });
 it("breaks missing strokes, excludes inferred ascent, and resolves zero-distance ties canonically",()=>{
  const p=(e,d,k="recorded")=>({elevation:e,distanceMeters:d,edgeKind:k,locator:{kind:"track-point",trackIndex:0,segmentIndex:0,pointIndex:d}});
  const layout=elevationLayout([{target:{kind:"track",trackIndex:0},samples:[p(10,0,"start"),p(20,0),p(null,1),p(30,2),p(50,3,"inferred-gap")]}]);expect(layout.strokes).toHaveLength(2);expect(layout.ascent).toBe(10);expect(nearestElevationSample(layout,layout.points[0].x)).toBe(layout.points[0]);expect(layout.strokes.at(-1).inferred).toBe(true);
 });
});

describe("mount-local Settings race",()=>{
 it("admits equal revisions from two surfaces, disables locally and restores authoritative values after stale rejection",async()=>{
  const report=vi.spyOn(scopedDom,"reportError");
  let start;const entered=new Promise(r=>start=r),gate=new Promise(r=>release=r);
  const builtins=builtinPluginCatalog.map(item=>item.id!=="tilia-gpx-domain"?item:{...item,load:async()=>({default:{...gpxPlugin,setup(c){gpxPlugin.setup({...c,domains:{...c.domains,provide(key,provider){c.domains.provide(key,{...provider,async prepareMutation(input){start();await gate;return provider.prepareMutation(input);}});}}});}}})});
  f=await uiFixture(["tilia-gpx-ui"],{builtins});const entry=await f.app.domains.gpx.create(data());const descriptor=f.context.contributions.settings.getSnapshot().find(item=>item.id==="gpx-preferences").descriptor;
  const mounts=[0,1].map(()=>{const container=f.doc.createElement("div");f.doc.body.appendChild(container);const scope=f.context.scope.child();descriptor.mount({container,scope,entry});return{container,scope};});
  const controls=mounts.map(m=>byClass(m.container,"tilia-gpx-style-select")[0]);controls[0].value="amber";controls[0].dispatchEvent(new Event("change"));await entered;expect(controls[0].disabled).toBe(true);expect(controls[1].disabled).not.toBe(true);
  controls[1].value="magenta";controls[1].dispatchEvent(new Event("change"));expect(controls[1].disabled).toBe(true);release();await settle();expect(f.app.domains.gpx.get(entry.id).revision).toBe(2);expect(f.app.domains.gpx.get(entry.id).snapshot.preferences.stylePresetId).toBe("amber");expect(controls.map(c=>c.value)).toEqual(["amber","amber"]);expect(controls.every(c=>!c.disabled)).toBe(true);
  expect(report).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({code:"ENTRY_STALE_REVISION"}));report.mockRestore();
 });
});
