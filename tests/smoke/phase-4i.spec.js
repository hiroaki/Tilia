import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { mockPhotoExif } from "../helpers/photo-exif.js";
const jpeg=resolve(import.meta.dirname,"../fixtures/photo-exif.jpg");
test("pinned exifr uses native FileReader; uninstall does not join reads and late parsing cannot create entries",async({page})=>{
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.route("https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.esm.js",route=>route.fulfill({path:resolve(import.meta.dirname,"../fixtures/exifr-7.1.3-lite.esm.js"),contentType:"text/javascript"}));
 await page.addInitScript(()=>{
  const Native=window.FileReader;window.exifAudit={hold:true,readers:[],release:[],aborts:0};
  window.FileReader=class extends Native{constructor(){super();window.exifAudit.readers.push(this);}set onloadend(callback){super.onloadend=(event)=>{if(window.exifAudit.hold)window.exifAudit.release.push(()=>callback(event));else callback(event);};}abort(){window.exifAudit.aborts++;return super.abort();}};
 });
 await page.goto("/tests/fixtures/phase-4h/");await expect(page.locator("body")).toHaveAttribute("data-phase4h-ready","true");
 await page.locator('input[type="file"]').setInputFiles(jpeg);await expect.poll(()=>page.evaluate(()=>window.exifAudit.release.length)).toBeGreaterThan(0);
 const before=await page.evaluate(async()=>{await window.phase4h.app.unuse("tilia-jpeg-input");return{pending:window.exifAudit.release.length,entries:window.phase4h.app.entries.list().length,aborts:window.exifAudit.aborts};});expect(before.entries).toBe(0);expect(before.pending).toBeGreaterThan(0);expect(before.aborts).toBe(0);
 await page.evaluate(()=>{window.exifAudit.hold=false;window.exifAudit.release.splice(0).forEach(release=>release());});
 await expect.poll(()=>page.evaluate(()=>window.exifAudit.readers.every(reader=>reader.readyState===FileReader.DONE))).toBe(true);
 await expect(page.locator('input[type="file"]')).toBeEnabled();expect(await page.evaluate(()=>window.phase4h.app.entries.list().length)).toBe(0);expect(errors).toEqual([]);
});
test("Drop imports actual JPEG through the shared domain handler",async({page})=>{
 await mockPhotoExif(page);
 const errors=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/tests/fixtures/viewer/");
 // The Viewer installs plugins asynchronously after its module has loaded.
 // File UI is installed after Drop; its JPEG discovery proves both are ready.
 await expect(page.locator('input[type="file"]')).toHaveAttribute("accept", /\.jpg/);
 const bytes=await import("node:fs/promises").then(fs=>fs.readFile(jpeg));
 const transfer=await page.evaluateHandle(encoded=>{const data=new DataTransfer();data.items.add(new File([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],"dropped.jpg",{type:"image/jpeg"}));return data;},bytes.toString("base64"));
 await page.locator("#map").dispatchEvent("drop",{dataTransfer:transfer});await expect(page.locator(".tilia-status-text")).toContainText("dropped.jpg");await expect(page.locator(".tilia-status-text")).toContainText("from drop");expect(errors).toEqual([]);
});
test("dispatch accepts native cross-realm operation signals and pre-abort prevents recognition",async({page})=>{
 await page.goto("/tests/fixtures/phase-4h/");await expect(page.locator("body")).toHaveAttribute("data-phase4h-ready","true");
 const result=await page.evaluate(async()=>{
  let inputs,calls=0;await window.phase4h.app.use({id:"x-cross-realm",setup(context){inputs=context.inputs;context.inputs.register({id:"custom",priority:100,recognize:()=>{calls++;return true;},handle:()=>"success"});}});
  const iframe=document.createElement("iframe");document.body.appendChild(iframe);const live=new iframe.contentWindow.AbortController(),cancelled=new iframe.contentWindow.AbortController();cancelled.abort("before");
  const first=await inputs.dispatch({name:"custom"},{signal:live.signal});const before=calls;let error;try{await inputs.dispatch({name:"custom"},{signal:cancelled.signal});}catch(e){error={code:e.code,details:e.details};}iframe.remove();await window.phase4h.app.unuse("x-cross-realm");return{first,before,calls,error};
 });expect(result.first).toBe("success");expect(result.calls).toBe(result.before);expect(result.error).toMatchObject({code:"INPUT_DISPATCH_CANCELLED",details:{semanticOutcome:"not-started"}});
});
