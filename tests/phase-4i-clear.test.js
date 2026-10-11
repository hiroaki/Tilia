import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("leaflet",()=>import("./helpers/leaflet-ui.js"));
import { uiFixture } from "./helpers/production-ui.js";
let f;afterEach(async()=>{await f?.close();f=null;});
const data=()=>({name:"clear.gpx",tracks:[]});
describe("public clear preserves EntryStore authority",()=>{
 it("retains the mutation gate throughout final delivery and exposes reverse active snapshot",async()=>{
  f=await uiFixture(["tilia-gpx-domain"]);const first=await f.app.domains.gpx.create(data()),last=await f.app.domains.gpx.create(data());const failures=[];
  const invoke=call=>{let result;try{result=call();}catch(error){result=Promise.reject(error);}failures.push(Promise.resolve(result).catch(error=>error));};
  f.context.entries.subscribe(event=>{if(event.type!=="cleared")return;invoke(()=>f.app.domains.gpx.create(data()));invoke(()=>f.context.entries.clear());invoke(()=>f.context.entries.setVisible(first.id,false));invoke(()=>f.context.entries.remove(last.id));});
  const removed=await f.app.entries.clear();expect(removed.map(e=>e.id)).toEqual([last.id,first.id]);expect(Object.isFrozen(removed)).toBe(true);expect((await Promise.all(failures)).every(e=>e.code==="ENTRY_REMOVING")).toBe(true);expect(f.app.entries.list()).toHaveLength(0);const survivor=await f.app.domains.gpx.create(data());expect(f.app.entries.get(survivor.id)).not.toBeNull();
 });
 it("empty clear emits the existing frozen empty batch",async()=>{f=await uiFixture();const events=[];f.context.entries.subscribe(e=>events.push(e),{emitCurrent:false});const result=await f.context.entries.clear();expect(result).toEqual([]);expect(Object.isFrozen(result)).toBe(true);expect(events).toEqual([{type:"cleared",removed:[]}]);});
});
