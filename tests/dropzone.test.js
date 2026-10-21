import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("leaflet", () => import("./helpers/leaflet-ui.js"));
import { uiFixture, settle } from "./helpers/production-ui.js";
let f; afterEach(async () => { await f?.close(); f = null; });
function drop(files, types = ["Files"]) { const e = new Event("drop", {cancelable:true}); Object.defineProperty(e,"dataTransfer",{value:{files,types}}); return e; }
describe("owned Drop transport", () => {
  it("dispatches sequential snapshots, continues ordinary failures, rejects busy batches and removes authority", async () => {
    f = await uiFixture(["tilia-dropzone"]); const calls = []; let release;
    await f.app.use({id:"x-input",setup(c){c.inputs.register({id:"test",recognize:()=>true,async handle({input}){ calls.push(input.name); if(input.name==="bad")throw new Error("bad"); await new Promise((r)=>{release=r;}); }});}});
    const target = f.map.container; target.dispatchEvent(drop([{name:"bad"},{name:"held"}])); await settle(); expect(calls).toEqual(["bad","held"]);
    target.dispatchEvent(drop([{name:"ignored"}])); await settle(); expect(calls).toEqual(["bad","held"]);
    await f.app.unuse("tilia-dropzone"); release(); await settle(); target.dispatchEvent(drop([{name:"late"}])); expect(calls).toEqual(["bad","held"]);
  });
});
