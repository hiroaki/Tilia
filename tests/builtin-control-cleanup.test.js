import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("leaflet", () => import("./helpers/leaflet-ui.js"));
import { uiFixture, byClass, settle } from "./helpers/production-ui.js";
let f; afterEach(async()=>{await f?.close();f=null;});
describe("standard product cleanup",()=>{
 it("repeatedly installs and removes controls, panels and feature leases without removing semantic entries",async()=>{
  f=await uiFixture(["tilia-gpx-domain"]);await f.app.domains.gpx.create({name:"profile.gpx",tracks:[{segments:[{points:[{lat:0,lon:0,elevation:10}]}]}]});
  for(let i=0;i<2;i++){
   for(const id of ["tilia-base-maps-control","tilia-status","tilia-elevation","tilia-file-import","tilia-url-import","tilia-dropzone"])await f.app.use(id);
   f.click("Elevation");await settle();expect(byClass(f.map.container,"tilia-elevation-chart")).toHaveLength(1);
   for(const id of ["tilia-dropzone","tilia-url-import","tilia-file-import","tilia-elevation","tilia-status","tilia-base-maps-control"])await f.app.unuse(id);
   expect(byClass(f.map.container,"tilia-elevation-chart")).toHaveLength(0);expect(byClass(f.map.container,"tilia-toolbar-item")).toHaveLength(0);expect(f.app.entries.list()).toHaveLength(1);
   expect(f.doc.head.children.filter((n)=>["tilia-elevation-ui","tilia-file-input-ui","tilia-url-input-ui","tilia-drop-input-ui","tilia-status-ui"].includes(n.dataset.tiliaStylesheet))).toHaveLength(0);
  }
 });
});
