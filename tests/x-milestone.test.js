import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("leaflet", () => import("./helpers/leaflet-ui.js"));
import { uiFixture, settle } from "./helpers/production-ui.js";
import { gpxDomainKey } from "../src/domains/index.js";
import { Layer } from "./helpers/leaflet-ui.js";
let f;
afterEach(async () => { vi.restoreAllMocks(); await f?.close(); f=null; });
const data={tracks:[
  {segments:[{points:[{lat:35,lon:135},{lat:35,lon:135.002}]},{points:[{lat:35,lon:135.004}]}]},
  {segments:[{points:[{lat:36,lon:136},{lat:36,lon:136.003}]}]},
]};
const markers=()=>[...f.map.layers].filter(layer=>layer.options.icon?.options.className==="tilia-milestone");
async function setup() {
  f=await uiFixture(["tilia-gpx-domain"]);f.map.getZoom=()=>20;
  const handlers=new Map();f.map.on=(type,callback)=>handlers.set(type,callback);f.map.off=(type,callback)=>{if(handlers.get(type)===callback)handlers.delete(type);};
  const entry=await f.app.domains.gpx.create(data);await f.app.use("x-milestone");await settle();return {entry,handlers};
}
describe("renderer-independent 4J-D Milestone",()=>{
  it("uses separate immutable Track-mode series with gap distance and noninteractive overlays-band labels",async()=>{
    await setup();expect(markers().filter(marker=>marker.options.icon.options.html.includes("100 m"))).toHaveLength(2);
    expect(markers()).toHaveLength(5);
    for(const marker of markers())expect(marker.options).toMatchObject({interactive:false,keyboard:false,pane:expect.stringContaining("overlays")});
  });
  it("honors entry/category/track preferences and overlapping suppression without mutating preferences",async()=>{
    const {entry}=await setup(), first=f.context.scope.child(), second=f.context.scope.child();
    const suppress=scope=>f.context.rendering.suppress({entryId:entry.id,domain:gpxDomainKey,target:{kind:"track",trackIndex:0},expectedRevision:f.app.domains.gpx.get(entry.id).revision,scope});
    const a=suppress(first),b=suppress(second);expect(markers()).toHaveLength(2);await a.dispose();expect(markers()).toHaveLength(2);
    await f.app.domains.gpx.setTrackVisibility(entry.id,{trackIndex:0,visible:false},{expectedRevision:1});await b.dispose();expect(markers()).toHaveLength(2);
    await f.app.entries.setVisible(entry.id,false);expect(markers()).toHaveLength(0);await f.app.entries.setVisible(entry.id,true);expect(markers()).toHaveLength(2);
    await f.app.domains.gpx.setCategoryVisibility(entry.id,{category:"tracks",visible:false},{expectedRevision:2});expect(markers()).toHaveLength(0);
    expect(f.app.domains.gpx.get(entry.id).snapshot.preferences.trackVisibility[0]).toBe(false);
  });
  it("survives renderer absence/reinstall, updates revision and zoom, and uninstalls/reinstalls without semantic loss",async()=>{
    const {entry,handlers}=await setup(), original=markers();
    await f.app.use("tilia-gpx-renderer");await settle();expect(markers()).toEqual(original);await f.app.unuse("tilia-gpx-renderer");expect(markers()).toEqual(original);
    await f.app.domains.gpx.updatePoint(entry.id,{target:{kind:"track-point",trackIndex:0,segmentIndex:0,pointIndex:1},patch:{lon:135.003}},{expectedRevision:1});expect(markers().every(marker=>!original.includes(marker))).toBe(true);
    f.map.getZoom=()=>14;handlers.get("zoomend")({});expect(markers()).toHaveLength(0);f.map.getZoom=()=>20;handlers.get("zoomend")({});expect(markers()).toHaveLength(5);
    const stale=handlers.get("zoomend");await f.app.unuse("x-milestone");expect(markers()).toHaveLength(0);stale({});expect(markers()).toHaveLength(0);
    expect(f.app.entries.get(entry.id)).not.toBeNull();await f.app.use("x-milestone");expect(markers()).toHaveLength(5);
  });
  it("withdraws on logical deletion before final notification and cannot resurrect from reentrant attachment",async()=>{
    const {entry}=await setup();const deleting=f.app.entries.remove(entry.id);await settle();await deleting;expect(markers()).toHaveLength(0);
    let removed=false, work;const original=Layer.prototype.addTo;
    vi.spyOn(Layer.prototype,"addTo").mockImplementation(function(map){const result=original.call(this,map);if(this.options.icon?.options.className==="tilia-milestone"&&!removed){removed=true;work=f.app.entries.clear();}return result;});
    await f.app.domains.gpx.create(data);await work;await settle();expect(f.app.entries.list()).toEqual([]);expect(markers()).toHaveLength(0);
  });
  it("rejects zero/negative intervals instead of admitting an unbounded threshold loop", async () => {
    f=await uiFixture(["tilia-gpx-domain"]);
    await expect(f.app.use("x-milestone",{intervalDefinition:{mapping:{},minZoom:5,maxZoom:20,maxNumberOfSigns:100,minIntervalMeters:0}})).rejects.toMatchObject({code:"PLUGIN_SETUP_FAILED",cause:{message:"Invalid Milestone interval definition"}});
    expect(f.app.listPlugins()).not.toContain("x-milestone");expect(markers()).toHaveLength(0);
    await f.app.use("x-milestone");
  });

  it("rechecks synchronous suppression acquired during a marker attachment", async () => {
    f=await uiFixture(["tilia-gpx-domain"]);f.map.getZoom=()=>20;await f.app.use("x-milestone");
    let lease;const original=Layer.prototype.addTo;
    vi.spyOn(Layer.prototype,"addTo").mockImplementation(function(map){
      const result=original.call(this,map);
      if(this.options.icon?.options.className==="tilia-milestone"&&!lease){
        const entry=f.app.entries.list()[0];lease=f.context.rendering.suppress({entryId:entry.id,domain:gpxDomainKey,target:{kind:"track",trackIndex:0},expectedRevision:1,scope:f.context.scope.child()});
      }
      return result;
    });
    await f.app.domains.gpx.create(data);expect(markers()).toHaveLength(2);await lease.dispose();expect(markers()).toHaveLength(5);
  });

});
