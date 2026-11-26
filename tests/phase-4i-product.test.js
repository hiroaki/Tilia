import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("leaflet",()=>import("./helpers/leaflet-ui.js"));
import { uiFixture, byClass, settle } from "./helpers/production-ui.js";
import { builtinPluginCatalog } from "../src/builtins.js";
import * as scopedDom from "../src/ui/scoped-dom.js";
import gpxPlugin from "../src/plugins/domains/gpx.js";
import photoPlugin from "../src/plugins/domains/photo.js";
import { photoDomainKey } from "../src/domains/keys.js";
import { elevationLayout, nearestElevationSample } from "../src/gpx/elevation-layout.js";
let f, release;afterEach(async()=>{release?.();release=null;await f?.close();f=null;});
const data=(name="profile.gpx")=>({name,tracks:[{segments:[{points:[{lat:0,lon:0,elevation:10},{lat:1,lon:1,elevation:20}]}]}]});
describe("Phase 4I semantic product behavior",()=>{
 it("keeps Layers rows stable when a GPX style changes through the API",async()=>{
  f=await uiFixture(["tilia-gpx-ui","tilia-layers"]);const a=await f.app.domains.gpx.create(data("a")),b=await f.app.domains.gpx.create(data("b"));f.click("Layers");await settle();const rows=byClass(f.map.container,"tilia-layer-item"),nodes=byClass(f.map.container,"tilia-gpx-tree");await f.app.domains.gpx.setStylePreset(a.id,"amber",{expectedRevision:1});await settle();expect(byClass(f.map.container,"tilia-layer-item")).toEqual(rows);expect(byClass(f.map.container,"tilia-gpx-tree")).toEqual(nodes);expect(f.app.entries.get(b.id)).not.toBeNull();
 });

 it("reconciles Settings when the GPX domain appears, disappears and returns", async () => {
   f = await uiFixture(["tilia-settings"]);
   f.click("Settings");
   await settle();
   const [panel] = byClass(f.map.container, "tilia-side-panel");
   const fields = () => byClass(panel, "tilia-gpx-presentation-mode");
   expect(panel.attributes["aria-label"]).toBe("Settings");
   expect(panel.classList.contains("tilia-side-panel-hidden")).toBe(false);
   expect(fields()).toHaveLength(0);

   await f.app.use("tilia-gpx-domain");
   const [old] = fields();
   expect(old.value).toBe("track");
   await f.app.unuse("tilia-gpx-domain");
   expect(fields()).toHaveLength(0);
   await f.app.use("tilia-gpx-domain");
   old.value = "segment";
   old.dispatchEvent(new Event("change"));
   await settle();
   expect(f.app.domains.gpx.getPresentationMode()).toBe("track");
   expect(fields()[0]).not.toBe(old);
   byClass(panel, "tilia-side-panel-close")[0].click();
   await settle();
   expect(panel.classList.contains("tilia-side-panel-hidden")).toBe(true);
 });

 it("keeps a single Settings field in sync across external updates and entry changes", async () => {
   f = await uiFixture(["tilia-gpx-domain", "tilia-settings"]);
   const { gpx } = f.app.domains;
   f.click("Settings");
   await settle();
   const fields = () => byClass(f.map.container, "tilia-gpx-presentation-mode");
   const [select] = fields();
   await gpx.setPresentationMode("segment");
   expect(select.value).toBe("segment");
   await gpx.create(data());
   await gpx.create(data("second"));
   expect(fields()).toEqual([select]);
   select.value = "track";
   select.dispatchEvent(new Event("change"));
   expect(select.disabled).toBe(true);
   await settle();
   expect(select.disabled).toBe(false);
   expect(gpx.getPresentationMode()).toBe("track");
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

describe("mount-local Photo row race", () => {
 it("admits equal revisions from two surfaces, disables locally and restores authoritative values after stale rejection", async () => {
   const report = vi.spyOn(scopedDom, "reportError");
   let start;
   const entered = new Promise(resolve => { start = resolve; });
   const gate = new Promise(resolve => { release = resolve; });
   const delayed = {
     ...photoPlugin,
     setup(context) {
       photoPlugin.setup({
         ...context,
         domains: {
           ...context.domains,
           provide(key, provider) {
             context.domains.provide(key, {
               ...provider,
               async prepareMutation(input) {
                 start();
                 await gate;
                 return provider.prepareMutation(input);
               },
             });
           },
         },
       });
     },
   };
   const builtins = builtinPluginCatalog.map(item => item.id === delayed.id
     ? { ...item, load: async () => ({ default: delayed }) }
     : item);
   f = await uiFixture(["tilia-photo-ui"], { builtins });
   const entry = await f.app.domains.photo.create({ data: { capturedAt: 0 } });
   const adapter = f.context.contributions.layers.get(photoDomainKey);
   const controls = [0, 1].map(() => {
     const container = f.doc.createElement("div");
     f.doc.body.appendChild(container);
     adapter.mount({ container, scope: f.context.scope.child(), entry });
     return byClass(container, "tilia-photo-time-mode-select")[0];
   });

   controls[0].value = "utc";
   controls[0].dispatchEvent(new Event("change"));
   await entered;
   expect(controls[0].disabled).toBe(true);
   expect(controls[1].disabled).not.toBe(true);
   controls[1].value = "local";
   controls[1].dispatchEvent(new Event("change"));
   expect(controls[1].disabled).toBe(true);
   release();
   await settle();
   expect(f.app.domains.photo.get(entry.id)).toMatchObject({
     revision: 2,
     snapshot: { preferences: { requestedTimeMode: "utc" } },
   });
   expect(controls.map(control => control.value)).toEqual(["utc", "utc"]);
   expect(controls.every(control => !control.disabled)).toBe(true);
   expect(report).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ code: "ENTRY_STALE_REVISION" }));
   report.mockRestore();
 });
});
