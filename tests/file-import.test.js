import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("leaflet", () => import("./helpers/leaflet-ui.js"));
import { uiFixture, byClass, settle } from "./helpers/production-ui.js";
let f; afterEach(async () => { await f?.close(); f = null; });
describe("File cancellation without uninstall join", () => {
  it("keeps picker busy until handler settlement, stops later items and ignores stale completion", async () => {
    f = await uiFixture(["tilia-file-import"]); let release; const calls=[];
    await f.app.use({id:"x-input",setup(c){c.inputs.register({id:"test",discovery:{extensions:[".test"]},recognize:()=>true,handle({input}){calls.push(input.name);return new Promise((r)=>{release=r;});}});}});
    const picker = byClass(f.map.container,"tilia-file-label")[0].children[0], cancel = byClass(f.map.container,"tilia-file-cancel")[0];
    expect(picker.accept).toBe(".test"); picker.files=[{name:"first"},{name:"second"}];picker.value="chosen";picker.dispatchEvent(new Event("change"));await settle();
    cancel.click(); expect(picker.disabled).toBe(true); expect(cancel.disabled).toBe(true); expect(byClass(f.map.container,"tilia-file-progress")[0].textContent).toContain("Cancelling");
    release();await settle();expect(calls).toEqual(["first"]);expect(picker.disabled).toBe(false);expect(picker.value).toBe("");
    picker.files=[{name:"third"}];picker.dispatchEvent(new Event("change"));await settle();await f.app.unuse("tilia-file-import");release();await settle();expect(byClass(f.map.container,"tilia-file-import-control")).toHaveLength(0);
  });
});

describe("handler withdrawal cancels its batch",()=>{
 it("stops remaining admission and suppresses successful completion status",async()=>{
  f=await uiFixture(["tilia-file-import","tilia-status"]);let release;const calls=[];
  await f.app.use({id:"x-held",setup(c){c.inputs.register({id:"held",recognize:()=>true,handle({input}){calls.push(input.name);return new Promise(r=>release=r);}});}});
  const picker=byClass(f.map.container,"tilia-file-label")[0].children[0];picker.files=[{name:"first"},{name:"second"}];picker.dispatchEvent(new Event("change"));await settle();await f.app.unuse("x-held");release({name:"late"});await settle();expect(calls).toEqual(["first"]);expect(byClass(f.map.container,"tilia-status-text")[0].textContent).toBe("Ready");expect(picker.disabled).toBe(false);
 });
});
