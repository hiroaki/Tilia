import { afterEach, expect, it, vi } from "vitest";
vi.mock("leaflet", async () => ({ ...await import("./helpers/leaflet-ui.js"), LatLng: class { constructor(lat,lng) { this.lat=lat; this.lng=lng; } } }));
vi.mock("../plugins/x-track-editor/vendor/leaflet-partially-editable-polyline.js", async () => {
  const { Layer } = await import("./helpers/leaflet-ui.js");
  return { PartiallyEditablePolyline: class extends Layer {
    startEditing() { this.editing=true; this.fire("editingstart",{index:0}); return this; }
    endEditing() { if(this.editing) { this.editing=false; this.fire("editingend"); } return this; }
    disableEditing() { return this.endEditing(); }
    getEditablePointRange() { return {startIndex:0,endIndex:this.point.length-1}; }
  } };
});
import { uiFixture, byClass, settle } from "./helpers/production-ui.js";
import { builtinPluginCatalog } from "../src/builtins.js";
import gpxPlugin from "../src/plugins/domains/gpx.js";
let f, release;
let expectedDestroyFailure = false;
afterEach(async()=>{ release?.(); release=null; if (expectedDestroyFailure) { await expect(f.app.destroy()).rejects.toMatchObject({ code: "APP_CLEANUP_FAILED" }); vi.unstubAllGlobals(); expectedDestroyFailure = false; } else await f?.close(); f=null; });
const source = { name:"initial.gpx", tracks:[{segments:[{points:[{lat:1,lon:2,elevation:0},{lat:3,lon:4}]}]}], routes:[{points:[{lat:5,lon:6}]}], waypoints:[{lat:7,lon:8}] };
const action = label => byClass(f.map.container,"tilia-track-editor-action").find(button=>button.textContent===label).click();
async function start(options={}) {
  f=await uiFixture(["x-track-editor"],options);
  f.map.latLngToContainerPoint=value=>({x:value.lng??value[1],y:value.lat??value[0]});
  f.map.dragging={enabled:()=>true,enable(){},disable(){}};
  const entry=await f.app.domains.gpx.create(source); f.click("Track editor"); await settle(); action("Start Edit"); await settle(); return entry;
}
const draftLayer=()=>[...f.map.layers].find(layer=>layer.options.className==="tilia-track-editor-draft");
it("keeps detached edits/history and full Save Copy after source mutation/deletion; cancel never recreates the source",async()=>{
  const entry=await start(); const initial=f.app.domains.gpx.getDocument(entry.id).document; const old=draftLayer(); old.startEditing(); old.fire("pointchange",{index:0,latlng:{lat:9,lng:10}}); await settle();
  await f.app.domains.gpx.replaceData(entry.id,{...source,name:"external",metadata:{name:"Replacement"},routes:[],waypoints:[]},{expectedRevision:1}); await f.app.entries.remove(entry.id); await settle();
  action("Undo"); await settle(); action("Redo"); await settle(); action("Save Copy"); await settle();
  const saved=f.app.entries.list(); expect(saved).toHaveLength(1); expect(saved[0].id).not.toBe(entry.id);
  const document=f.app.domains.gpx.getDocument(saved[0].id).document; expect(document.name).toBe("initial (edited).gpx");
  expect(document.tracks[0].segments[0].points[0]).toMatchObject({lat:9,lon:10,elevation:0}); expect(document.routes).toEqual(initial.routes); expect(document.waypoints).toEqual(initial.waypoints);
  expect(document.metadata).toEqual(initial.metadata);
  action("Start Edit"); await settle(); await f.app.entries.remove(saved[0].id); action("Cancel"); await settle();
  expect(f.app.entries.list()).toEqual([]); expect(f.context.rendering.getSuppressionSnapshot()).toEqual([]);
  old.fire("pointchange",{index:0,latlng:{lat:11,lng:12}}); expect(f.app.entries.list()).toEqual([]);
});
it("retains draft after failed create, then uses caller cancellation as the precommit Save barrier",async()=>{
  let fail=true, held=false;
  const builtins=builtinPluginCatalog.map(item=>item.id!=="tilia-gpx-domain"?item:{...item,load:async()=>({default:{...gpxPlugin,setup(context){gpxPlugin.setup({...context,domains:{...context.domains,provide(key,provider){context.domains.provide(key,{...provider,async prepareCreate(input){
    if(input.value.name.includes("edited")) { if(fail) throw new Error("save rejected"); if(held) await new Promise(resolve=>release=resolve); }
    return provider.prepareCreate(input);
  }});}}});}}})});
  await start({builtins}); action("Save Copy"); await settle(); expect(draftLayer()).toBeDefined(); expect(f.app.entries.list()).toHaveLength(1);
  fail=false; held=true; action("Save Copy"); await settle(); action("Cancel"); await settle(); release(); await settle(); expect(f.app.entries.list()).toHaveLength(1); expect(draftLayer()).toBeUndefined();
});
it("keeps the option and history after failure, then saves the complete draft when the option is cleared", async () => {
  const attempts = [];
  const customDomain = {
    ...gpxPlugin,
    setup(context) {
      gpxPlugin.setup({
        ...context,
        domains: {
          ...context.domains,
          provide(key, provider) {
            context.domains.provide(key, {
              ...provider,
              async prepareCreate(input) {
                if (input.value.name.includes("edited")) {
                  attempts.push(input.value);
                  if (attempts.length === 1) throw new Error("save rejected");
                }
                return provider.prepareCreate(input);
              },
            });
          },
        },
      });
    },
  };
  const builtins = builtinPluginCatalog.map(item => item.id === gpxPlugin.id
    ? { ...item, load: async () => ({ default: customDomain }) }
    : item);
  const entry = await start({ builtins });
  const gpx = f.app.domains.gpx;
  const original = gpx.getDocument(entry.id).document;
  const layer = draftLayer();
  layer.startEditing();
  layer.fire("pointchange", { index: 0, latlng: { lat: 9, lng: 10 } });
  await settle();
  action("Undo");
  await settle();

  const checkbox = () => byClass(f.map.container, "tilia-track-editor-save-option")[0].children[0];
  function setTracksOnly(checked) {
    const input = checkbox();
    input.checked = checked;
    input.dispatchEvent(new Event("change"));
  }

  expect(checkbox().checked).toBe(false);
  setTracksOnly(true);
  action("Save Copy");
  action("Save Copy");
  await settle();
  expect(attempts).toHaveLength(1);
  expect(attempts[0]).toEqual({ ...original, name: "initial (edited).gpx", routes: [], waypoints: [] });
  expect(checkbox().checked).toBe(true);
  expect(f.app.entries.list()).toHaveLength(1);

  setTracksOnly(false);
  action("Redo");
  await settle();
  action("Save Copy");
  await settle();
  expect(attempts).toHaveLength(2);
  const saved = f.app.entries.list().find(candidate => candidate.id !== entry.id);
  const expected = structuredClone(original);
  expected.name = "initial (edited).gpx";
  Object.assign(expected.tracks[0].segments[0].points[0], { lat: 9, lon: 10 });
  expect(gpx.getDocument(saved.id).document).toEqual(expected);
  expect(gpx.getDocument(entry.id).document).toEqual(original);
});

it("saves inserted and deleted track points in order with their surviving attributes", async () => {
  const sourceEntry = await start();
  const gpx = f.app.domains.gpx;
  const original = gpx.getDocument(sourceEntry.id).document;
  const layer = draftLayer();
  layer.startEditing();
  layer.fire("pointinsert", { index: 1, latlng: { lat: 2, lng: 3 } });
  layer.fire("pointdelete", { index: 2 });
  layer.fire("pointchange", { index: 0, latlng: { lat: 1.5, lng: 2.5 } });
  await settle();
  action("Save Copy");
  await settle();

  const saved = f.app.entries.list().find(entry => entry.id !== sourceEntry.id);
  const expected = structuredClone(original);
  expected.name = "initial (edited).gpx";
  expected.tracks[0].segments[0].points = [
    { ...original.tracks[0].segments[0].points[0], lat: 1.5, lon: 2.5 },
    { lat: 2, lon: 3, elevation: null, timestamp: null },
  ];
  expect(gpx.getDocument(saved.id).document).toEqual(expected);
  expect(gpx.getDocument(sourceEntry.id).document).toEqual(original);
});

it("preserves postcommit copy when cancellation is triggered by the created callback",async()=>{
  await start(); f.context.entries.subscribe(event=>{if(event.type==="created")action("Cancel");},{emitCurrent:false});
  action("Save Copy"); await settle(); expect(f.app.entries.list()).toHaveLength(2); expect(draftLayer()).toBeUndefined();
});
it("keeps unresolved vendor child cleanup quarantined and blocks reinstall without retrying unverified records",async()=>{
  await start(); const layer=draftLayer(); const removal=vi.spyOn(layer,"remove"); const terminate=vi.spyOn(layer,"disableEditing").mockImplementation(()=>{throw new Error("vendor helper residue");});
  let failure;try { await f.app.unuse("x-track-editor"); } catch(error) { failure=error; }
  expect(failure).toMatchObject({code:"PLUGIN_TEARDOWN_FAILED"});
  expect(failure.cause.errors.map(error=>error.message)).toContain("vendor helper residue");
  expect(failure.cause.report.failures.some(record=>record.label==="vendor-edit-termination"&&record.retry==="never")).toBe(true);
  expect(removal).toHaveBeenCalledOnce();
  expect(f.app.listPlugins()).not.toContain("x-track-editor");
  await expect(f.app.use("x-track-editor")).rejects.toMatchObject({code:"PLUGIN_QUARANTINED"});
  await expect(f.app.unuse("x-track-editor")).rejects.toMatchObject({code:"PLUGIN_TEARDOWN_FAILED"}); expect(terminate).toHaveBeenCalledOnce();
  // No invented recovery: terminal/non-retry-safe residual intentionally remains.
  expectedDestroyFailure = true;
});

it("keeps the active edit and undo/redo history across mode changes, and saves in the current mode", async () => {
  const entry = await start();
  const gpx = f.app.domains.gpx;
  const layer = draftLayer();
  layer.startEditing();
  layer.fire("pointchange", { index: 0, latlng: { lat: 9, lng: 10 } });
  await settle();

  await gpx.setPresentationMode("segment");
  expect(draftLayer()).toBe(layer);
  expect(layer.editing).toBe(true);
  expect(f.context.rendering.getSuppressionSnapshot()).toMatchObject([
    { entryId: entry.id, ref: { trackIndex: 0, revision: gpx.get(entry.id).revision } },
  ]);
  action("Undo"); await settle();
  await gpx.setPresentationMode("track");
  action("Redo"); await settle();
  await gpx.setPresentationMode("segment");
  action("Save Copy"); await settle();

  const copy = f.app.entries.list().find(candidate => candidate.id !== entry.id);
  expect(gpx.get(copy.id).snapshot.derived.presentationMode).toBe("segment");
  expect(gpx.getDocument(copy.id).document.tracks[0].segments[0].points[0]).toMatchObject({ lat: 9, lon: 10 });
  expect(gpx.getDocument(entry.id).document.tracks[0].segments[0].points[0]).toMatchObject({ lat: 1, lon: 2 });
  expect(f.context.rendering.getSuppressionSnapshot()).toEqual([]);

  action("Start Edit"); await settle();
  await gpx.setPresentationMode("track");
  action("Cancel"); await settle();
  expect(draftLayer()).toBeUndefined();
  expect(f.context.rendering.getSuppressionSnapshot()).toEqual([]);
  expect(gpx.get(entry.id).snapshot.derived.presentationMode).toBe("track");
});
