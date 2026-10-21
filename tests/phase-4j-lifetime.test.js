import { afterEach, expect, it, vi } from "vitest";
vi.mock("leaflet", () => import("./helpers/leaflet-ui.js"));
const observed = vi.hoisted(() => ({ foundation: null }));
vi.mock("../src/semantic-foundation.js", async importOriginal => {
  const original = await importOriginal();
  return { ...original, async createSemanticFoundation(options) {
    observed.foundation = await original.createSemanticFoundation(options); return observed.foundation;
  } };
});
import { uiFixture, settle } from "./helpers/production-ui.js";
import { createScopeController } from "../src/ownership/index.js";
import { builtinPluginCatalog } from "../src/builtins.js";
import gpxPlugin from "../src/plugins/domains/gpx.js";
let f, release;
afterEach(async () => { release?.(); release = null; await f?.close(); f = null; });
const data = { tracks: [{ segments: [{ points: [{ lat:0, lon:0 }, { lat:0, lon:1 }] }] }] };
async function setup(dispose) {
  const builtins = builtinPluginCatalog.map(item => item.id !== "tilia-gpx-domain" ? item : { ...item, load: async () => ({default:{...gpxPlugin,setup(context){
    gpxPlugin.setup({...context,domains:{...context.domains,provide(key,provider){context.domains.provide(key,{...provider,async prepareCreate(input){return {...await provider.prepareCreate(input),dispose};}});}}});
  }}}) });
  f = await uiFixture(["tilia-gpx-domain"], { builtins });
  return f.app.domains.gpx.create(data);
}
it("withdraws bound presentation synchronously, awaits its cleanup before entry resources and preserves final removed timing", async () => {
  const order=[], entry=await setup(()=>order.push("provider")), scope=f.context.scope.child();
  scope.signal.addEventListener("abort",()=>order.push("withdraw"));
  scope.defer(async()=>{order.push("presentation");await new Promise(resolve=>release=resolve);order.push("presentation-done");});
  f.context.entries.bindPresentationLifetime(entry.id,{scope});
  f.context.entries.subscribe(event=>{if(event.type==="removed")order.push("removed");},{emitCurrent:false});
  const deleting=f.app.entries.remove(entry.id); await settle();
  expect(f.app.entries.get(entry.id)).toBeNull(); expect(scope.alive).toBe(false); expect(order).toEqual(["withdraw","presentation"]);
  release();await deleting; expect(order).toEqual(["withdraw","presentation","presentation-done","provider","removed"]);
});
it("continues independent cleanup after failure and retains the provider lease until safe residual retry completes", async () => {
  const order=[], entry=await setup(()=>order.push("provider")), scope=f.context.scope.child(); let fail=true, attempts=0;
  scope.defer(()=>{attempts++;if(fail)throw new Error("bound residue");order.push("bound");},{retry:"safe"});
  f.context.entries.bindPresentationLifetime(entry.id,{scope});
  await expect(f.app.entries.remove(entry.id)).rejects.toMatchObject({code:"SEMANTIC_CLEANUP_FAILED",committed:true});
  expect(order).toEqual(["provider"]);expect(attempts).toBe(1);
  expect(observed.foundation.entries.inspect().residuals).toHaveLength(1);
  await expect(f.app.unuse("tilia-gpx-domain")).rejects.toBeDefined();
  fail=false;await observed.foundation.entries.retryCleanup(f.context.scope,entry.id);
  expect(order).toEqual(["provider","bound"]);expect(attempts).toBe(2);expect(observed.foundation.entries.inspect().residuals).toEqual([]);
});
it("joins explicit disposal and deletion of an already-closing presentation without rerunning successful records", async () => {
  const entry=await setup(), scope=f.context.scope.child(), cleanup=vi.fn(async()=>new Promise(resolve=>release=resolve));scope.defer(cleanup);
  const lease=f.context.entries.bindPresentationLifetime(entry.id,{scope});expect(Object.isFrozen(lease)).toBe(true);
  const closing=lease.dispose();const deletion=f.app.entries.remove(entry.id);await settle();expect(cleanup).toHaveBeenCalledOnce();
  release();await Promise.all([closing,deletion]);await lease.dispose();expect(cleanup).toHaveBeenCalledOnce();
});
it("uses reverse clear ordering with final batched notification and rejects foreign/root/dead/deleted scope bindings", async () => {
  const first=await setup(), second=await f.app.domains.gpx.create(data), order=[];
  for(const entry of [first,second]){const scope=f.context.scope.child();scope.defer(()=>order.push(entry.id));f.context.entries.bindPresentationLifetime(entry.id,{scope});}
  f.context.entries.subscribe(event=>{if(event.type==="cleared")order.push("cleared");},{emitCurrent:false});
  const foreign=createScopeController();await foreign.commit();
  expect(()=>f.context.entries.bindPresentationLifetime(first.id,{scope:foreign.scope})).toThrow();
  expect(()=>f.context.entries.bindPresentationLifetime(first.id,{scope:f.context.scope})).toThrow();await foreign.close();
  const dead=f.context.scope.child();await dead.dispose();expect(()=>f.context.entries.bindPresentationLifetime(first.id,{scope:dead})).toThrow();
  await f.app.entries.clear();expect(order).toEqual([second.id,first.id,"cleared"]);
  expect(()=>f.context.entries.bindPresentationLifetime(first.id,{scope:f.context.scope.child()})).toThrow();
});

it("Milestone physically withdraws before delayed provider cleanup and stays absent during the uninstall/delete race", async () => {
  const order=[]; const entry=await setup(async()=>{order.push("provider");await new Promise(resolve=>release=resolve);});
  f.map.getZoom=()=>20;await f.app.use("x-milestone");
  const markers=()=>[...f.map.layers].filter(layer=>layer.options.icon?.options.className==="tilia-milestone");
  expect(markers().length).toBeGreaterThan(0);
  f.context.entries.subscribe(event=>{if(event.type==="removed")order.push("removed");},{emitCurrent:false});
  const deleting=f.app.entries.remove(entry.id);await vi.waitFor(()=>expect(order).toEqual(["provider"]));expect(markers()).toHaveLength(0);
  const uninstall=f.app.unuse("x-milestone");await uninstall;expect(markers()).toHaveLength(0);
  release();await deleting;expect(order).toEqual(["provider","removed"]);expect(markers()).toHaveLength(0);
  await f.app.use("x-milestone");expect(markers()).toHaveLength(0);
});

it("plugin uninstall and entry deletion join the same held presentation cleanup exactly once", async () => {
  const provider=vi.fn(),entry=await setup(provider),scope=f.context.scope.child(),cleanup=vi.fn(async()=>new Promise(resolve=>release=resolve));
  scope.defer(cleanup);f.context.entries.bindPresentationLifetime(entry.id,{scope});
  const uninstall=f.app.unuse("x-ui-observer");await vi.waitFor(()=>expect(scope.alive).toBe(false));
  const deletion=f.app.entries.remove(entry.id);await settle();expect(provider).not.toHaveBeenCalled();expect(cleanup).toHaveBeenCalledOnce();
  release();await Promise.all([uninstall,deletion]);expect(cleanup).toHaveBeenCalledOnce();expect(provider).toHaveBeenCalledOnce();
});

it("reserves closure before a synchronous abort callback reenters lease disposal and rejects deleted-entry rebinding", async () => {
  const entry=await setup(),scope=f.context.scope.child(),cleanup=vi.fn();let lease,nested;
  scope.defer(cleanup);
  scope.signal.addEventListener("abort",()=>{
    nested=lease.dispose();
    expect(f.app.entries.get(entry.id)).toBeNull();
    expect(()=>f.context.entries.bindPresentationLifetime(entry.id,{scope:f.context.scope.child()})).toThrow();
  });
  lease=f.context.entries.bindPresentationLifetime(entry.id,{scope});
  await f.app.entries.remove(entry.id);await expect(nested).resolves.toBeUndefined();expect(cleanup).toHaveBeenCalledOnce();
});
