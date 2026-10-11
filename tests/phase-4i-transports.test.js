import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("leaflet",()=>import("./helpers/leaflet-ui.js"));
import { createScopeController } from "../src/ownership/scope.js";
import { importRemote, remoteOptions } from "../src/plugins/input/transport.js";
import { uiFixture, byClass, settle } from "./helpers/production-ui.js";
let f,owner,release;afterEach(async()=>{release?.();release=null;await f?.close();f=null;await owner?.close();owner=null;vi.useRealTimers();vi.unstubAllGlobals();});
function context(){owner=createScopeController();return{scope:owner.scope,inputs:{dispatch:vi.fn()},services:{optional:()=>null},diagnostics:{report:vi.fn()}};}
describe("transport phase races",()=>{
 it.each(["fetch","body"])("timeout in %s aborts the same request and performs no dispatch",async(phase)=>{
  vi.useFakeTimers();const c=context();let fetchSignal,cancel=vi.fn();
  vi.stubGlobal("fetch",vi.fn((_url,{signal})=>{fetchSignal=signal;if(phase==="fetch")return new Promise((_r,reject)=>signal.addEventListener("abort",()=>reject(signal.reason),{once:true}));return Promise.resolve({ok:true,headers:new Headers(),body:{getReader(){return{read:()=>new Promise((_r,reject)=>signal.addEventListener("abort",()=>reject(signal.reason),{once:true})),cancel,releaseLock:vi.fn()};}}});}));
  const work=importRemote(c,{url:"https://example.com/a.gpx",scope:owner.scope,...remoteOptions({timeoutMs:10})}).catch(e=>e);await settle();await vi.advanceTimersByTimeAsync(10);const error=await work;expect(fetchSignal.aborted).toBe(true);expect(error.name).toBe("TimeoutError");expect(c.inputs.dispatch).not.toHaveBeenCalled();if(phase==="body")expect(cancel).toHaveBeenCalledOnce();
 });
 it("URL close/reopen keeps its captured generation busy until noncooperative handling settles",async()=>{
  f=await uiFixture(["tilia-url-import"]);const calls=[];await f.app.use({id:"x-handler",setup(c){c.inputs.register({id:"test",recognize:()=>true,handle({input}){calls.push(input.name);return new Promise(r=>release=r);}});}});vi.stubGlobal("fetch",vi.fn(async()=>new Response("x")));
  f.click("Load URL");const input=byClass(f.map.container,"tilia-url-input")[0];input.value="https://example.com/a.gpx";byClass(f.map.container,"tilia-url-load-button")[0].click();await settle();expect(calls).toEqual(["a.gpx"]);byClass(f.map.container,"tilia-url-close-button")[0].click();f.click("Load URL");expect(input.disabled).toBe(true);expect(byClass(f.map.container,"tilia-url-progress")[0].textContent).toContain("Cancelling");release();await settle();expect(input.disabled).toBe(false);expect(calls).toHaveLength(1);
 });
 it("handler-first Query starts after own activation and uses custom parameter once",async()=>{
  vi.stubGlobal("window",{location:{search:"?track=https://example.com/a.test",href:"https://example.com/"}});const fetch=vi.fn(async()=>new Response("x"));vi.stubGlobal("fetch",fetch);f=await uiFixture();await f.app.use({id:"x-handler",setup(c){c.inputs.register({id:"test",recognize:()=>true,handle:()=>({name:"ok"})});}});expect(fetch).not.toHaveBeenCalled();await f.app.use("tilia-query-import",{parameterName:"track"});await settle();expect(fetch).toHaveBeenCalledOnce();
 });
});
