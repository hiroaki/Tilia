import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("leaflet",()=>import("./helpers/leaflet-ui.js"));
vi.mock("https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.esm.js",()=>import("./fixtures/exifr-7.1.3-lite.esm.js"));
import { uiFixture, settle } from "./helpers/production-ui.js";
let f;afterEach(async()=>{await f?.close();f=null;vi.unstubAllGlobals();});
describe("actual pinned exifr 7.1.3 browser Blob reader",()=>{
 it("verifies the exact downloaded lite bundle",()=>{expect(createHash("sha256").update(readFileSync(new URL("./fixtures/exifr-7.1.3-lite.esm.js",import.meta.url))).digest("hex")).toBe("9c18a09ddc50bb7f4171fa292e5593d6bf4b96857783b6e8e20cc6c0a53c73c1");});
 it("does not join private reads at uninstall and blocks late EXIF entry/URL creation",async()=>{
  const readers=[];let release;const gate=new Promise(r=>release=r);let held=true;
  vi.stubGlobal("FileReader",class{constructor(){this.readyState=0;readers.push(this);}readAsArrayBuffer(blob){this.readyState=1;void(async()=>{if(held)await gate;this.result=await blob.arrayBuffer();this.readyState=2;this.onloadend?.();})();}});
  const createObjectURL=vi.fn(()=>"blob:unexpected");f=await uiFixture(["tilia-jpeg-input"],{pluginOptions:{"tilia-photo-domain":{createObjectURL,revokeObjectURL:vi.fn()}}});
  const file=new File([readFileSync(new URL("../samples/embed/IMG_2892.JPG",import.meta.url))],"photo.jpg",{type:"image/jpeg"});
  const work=f.app.load(file);const observed=work.catch(e=>e);await vi.waitFor(()=>expect(readers.length).toBeGreaterThan(0));expect(readers[0].readyState).toBe(1);
  await f.app.unuse("tilia-jpeg-input");expect(readers[0].readyState).toBe(1);held=false;release();const error=await observed;expect(error.code).toBe("INPUT_DISPATCH_CANCELLED");expect(f.app.entries.list()).toHaveLength(0);expect(createObjectURL).not.toHaveBeenCalled();expect(readers.every(r=>r.readyState===2)).toBe(true);
 });
 it("settles a private FileReader error and observes rejection without acquiring preview resources",async()=>{vi.stubGlobal("FileReader",class{readAsArrayBuffer(){queueMicrotask(()=>this.onerror?.(new Error("read failed")));}});f=await uiFixture(["tilia-jpeg-input"]);await expect(f.app.load(new File(["x"],"bad.jpg",{type:"image/jpeg"}))).rejects.toMatchObject({code:"INPUT_DISPATCH_FAILED"});expect(f.app.entries.list()).toHaveLength(0);});
});

describe("pinned EXIF follow-up chunk failure",()=>{
 it("settles failure of a subsequent Blob chunk without live private readers or URL acquisition",async()=>{
  const readers=[];vi.stubGlobal("FileReader",class{constructor(){this.readyState=0;readers.push(this);}readAsArrayBuffer(blob){this.readyState=1;void blob.arrayBuffer().then(buffer=>{this.readyState=2;if(readers.length===2)this.onerror?.(new Error("follow-up chunk failed"));else{this.result=buffer;this.onloadend?.();}});}});
  const {default:exifr}=await import("./fixtures/exifr-7.1.3-lite.esm.js");const BlobReader=exifr.fileReaders.get("blob"),reader=new BlobReader(new Blob(["0123456789"]),{});
  await reader._readChunk(0,4);await expect(reader._readChunk(4,4)).rejects.toThrow("follow-up chunk failed");expect(readers).toHaveLength(2);expect(readers.every(r=>r.readyState===2)).toBe(true);expect(reader.close()).toBeUndefined();
 });
});
