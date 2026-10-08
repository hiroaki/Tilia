import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("4J-A exports rich immutable GPX and reimports its supported values", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/samples/phase-4j/");
  await expect(page.locator("body")).toHaveAttribute("data-phase4j-ready", "true");
  await page.evaluate(async () => {
    const data = { name: "Rich.GPX", metadata: { name: "Rich", description: "<&>", timestamp: 0 },
      tracks: [{ name: "Track", segments: [{ points: [{ lat: 35.68, lon: 139.76, elevation: 0, timestamp: 0 }, { lat: 35.69, lon: 139.77 }] }] }],
      routes: [{ name: "Route", points: [{ lat: 35.70, lon: 139.78 }] }], waypoints: [{ name: "<&>", lat: 35.71, lon: 139.79 }] };
    const entry = await window.phase4j.app.domains.gpx.create(data, { visible: false });
    window.phase4j.original = window.phase4j.app.domains.gpx.getDocument(entry.id).document;
  });
  await page.getByRole("button", { name: "GPX export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export GPX", exact: true }).click();
  const download = await pending; expect(download.suggestedFilename()).toBe("Rich.GPX");
  const xml = await readFile(await download.path(), "utf8");
  expect(xml).toContain("&lt;&amp;&gt;"); expect(xml).toContain("<ele>0</ele>");
  const result = await page.evaluate(async xml => {
    const { parseGpxText } = await import("/src/gpx/parse.js");
    const { app, original } = window.phase4j;
    const entry = await app.domains.gpx.create(parseGpxText(xml, { fileName: original.name }));
    const round = app.domains.gpx.getDocument(entry.id).document;
    await app.unuse("x-gpx-export");
    return { original, round, anchors: document.querySelectorAll(".tilia-gpx-export-download").length };
  }, xml);
  expect(result.round).toEqual(result.original); expect(result.anchors).toBe(0); expect(errors).toEqual([]);
});
test("4J-B form, draggable markers and context menu automatically create persistent GPX", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  let request;
  await page.route("http://127.0.0.1:3000/route", async route => {
    request = route.request().postDataJSON();
    await route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ route: {
      geometry: { type: "LineString", coordinates: [[139.76,35.68],[139.77,35.69]] }, distance_meters: 1000, duration_seconds: 100, provider: "controlled"
    } }) });
  });
  await page.goto("/samples/phase-4j/"); await expect(page.locator("body")).toHaveAttribute("data-phase4j-ready", "true");
  await page.getByRole("button", { name: "Route search", exact: true }).click();
  await page.getByRole("textbox", { name: "Start coordinates" }).fill("35.68,139.76");
  await page.getByRole("textbox", { name: "Goal coordinates" }).fill("35.69,139.77");
  const marker = page.locator(".tilia-route-search-marker-origin"); await expect(marker).toHaveCount(1);
  const box = await marker.boundingBox();
  await page.mouse.move(box.x + box.width/2, box.y + box.height/2); await page.mouse.down();
  await page.mouse.move(box.x + box.width/2 + 25, box.y + box.height/2 + 10, { steps: 5 }); await page.mouse.up();
  await expect(page.getByRole("textbox", { name: "Start coordinates" })).not.toHaveValue("35.68,139.76");
  await page.evaluate(() => window.phase4j.map.fire("contextmenu", { latlng: { lat:35.685, lng:139.765 }, containerPoint:{x:500,y:250} }));
  await page.getByRole("button", { name: "Add as Via" }).click();
  await expect(page.getByRole("textbox", { name: "Via 1 coordinates" })).toHaveValue("35.685, 139.765");
  await page.getByRole("button", { name: "Search Routes", exact:true }).click();
  await expect.poll(() => page.evaluate(() => window.phase4j.app.entries.list().length)).toBe(1);
  await expect(page.locator(".tilia-route-search-result")).toHaveCount(1);
  expect(request.points).toHaveLength(3);
  const result = await page.evaluate(async () => {
    const { app } = window.phase4j;
    const entry = app.entries.list()[0], document = app.domains.gpx.getDocument(entry.id).document;
    await app.unuse("x-route-search");
    return { document, entries:app.entries.list().length };
  });
  expect(result.document.tracks).toHaveLength(1); expect(result.document.routes).toHaveLength(0);
  expect(result.document.waypoints.map(point => point.name)).toEqual(["Start","Via 1","Goal"]);
  expect(result.entries).toBe(1); await expect(page.locator(".tilia-route-search-marker-icon")).toHaveCount(0); expect(errors).toEqual([]);
});
async function editorSession(page, { overlap = false } = {}) {
  await page.goto("/samples/phase-4j/"); await expect(page.locator("body")).toHaveAttribute("data-phase4j-ready","true");
  const id = await page.evaluate(async overlap => {
    const track = { segments: [{ points: [{lat:35.68,lon:139.76,elevation:0},{lat:35.682,lon:139.765},{lat:35.684,lon:139.77}] }] };
    const entry = await window.phase4j.app.domains.gpx.create({name:"initial.gpx",tracks:overlap?[track,track]:[track],routes:[{points:[{lat:35.67,lon:139.75}]}],waypoints:[{lat:35.67,lon:139.75}]});
    return entry.id;
  }, overlap);
  await page.getByRole("button",{name:"Track editor",exact:true}).click();
  await page.getByRole("button",{name:"Start Edit",exact:true}).click();
  await page.evaluate(()=>{const {map}=window.phase4j;map.fire("click",{latlng:{lat:35.68,lng:139.76}});});
  await expect(page.locator(".leaflet-partially-editable-polyline-point")).toHaveCount(3);
  return id;
}
async function dragMarker(page, selector, dx, dy, { release = true } = {}) {
  const box = await page.locator(selector).first().boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+dx,box.y+box.height/2+dy,{steps:5});
  if (release) await page.mouse.up();
}
test("4J-C continues initialized editing, Undo/Redo and Save Copy after source deletion and renderer removal",async({page})=>{
  const id=await editorSession(page);
  await page.evaluate(async id=>{const {app}=window.phase4j;await app.domains.gpx.replaceData(id,{name:"external",tracks:[]},{expectedRevision:1});await app.entries.remove(id);await app.unuse("tilia-gpx-renderer");},id);
  await dragMarker(page,".leaflet-partially-editable-polyline-point",20,10);
  await page.getByRole("button",{name:"Undo",exact:true}).click(); await page.getByRole("button",{name:"Redo",exact:true}).click();
  await page.getByRole("button",{name:"Save Copy",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.phase4j.app.entries.list().length)).toBe(1);
  const result=await page.evaluate(()=>{const {app}=window.phase4j;return app.domains.gpx.getDocument(app.entries.list()[0].id).document;});
  expect(result.name).toBe("initial (edited).gpx"); expect(result.tracks[0].segments[0].points[0].lat).not.toBe(35.68); expect(result.routes).toEqual([]); expect(result.waypoints).toEqual([]);
  await expect(page.locator(".leaflet-partially-editable-polyline-point")).toHaveCount(0);
});
test("4J-C vendor default panes permit real point/midpoint dragging over overlapping draft geometry and clean active gestures",async({page})=>{
  await editorSession(page,{overlap:true});
  const placement=await page.evaluate(()=>({
    markerPane:document.querySelector(".leaflet-partially-editable-polyline-point").parentElement.classList.contains("leaflet-marker-pane"),
    modal:document.querySelector(".tilia-track-editor-draft").closest(".leaflet-pane").dataset.tiliaMapBand,
    pointer: getComputedStyle(document.querySelector(".tilia-track-editor-draft")).pointerEvents,
  }));expect(placement).toEqual({markerPane:true,modal:"modal",pointer:"none"});
  await page.locator(".leaflet-partially-editable-polyline-point").first().click();
  await expect(page.locator(".tilia-track-editor-selection-ring")).toHaveCount(1);
  await dragMarker(page,".leaflet-partially-editable-polyline-point",20,10);
  await expect(page.getByRole("button",{name:"Undo",exact:true})).toBeEnabled();
  await dragMarker(page,".leaflet-partially-editable-polyline-new-point",15,-10);
  await expect(page.locator(".leaflet-partially-editable-polyline-point")).toHaveCount(4);
  await dragMarker(page,".leaflet-partially-editable-polyline-point",10,15,{release:false});
  await expect(page.locator(".leaflet-overlay-pane path[stroke-dasharray='5,1']")).not.toHaveCount(0);
  // End editing during the native pointer gesture without fabricating pointerup first.
  await page.evaluate(()=>document.querySelectorAll(".tilia-track-editor-action").forEach(button=>{if(button.textContent==="Cancel")button.click();}));
  await page.mouse.up();
  await expect(page.locator(".leaflet-partially-editable-polyline-point")).toHaveCount(0);
  await expect(page.locator(".leaflet-overlay-pane path[stroke-dasharray='5,1']")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveClass(/leaflet-dragging/);
  await page.getByRole("button",{name:"Start Edit",exact:true}).click();
  await page.evaluate(()=>window.phase4j.map.fire("click",{latlng:{lat:35.68,lng:139.76}}));
  await dragMarker(page,".leaflet-partially-editable-polyline-new-point",10,-10,{release:false});
  await page.evaluate(()=>window.phase4j.app.unuse("x-track-editor")); await page.mouse.up();
  await expect(page.locator(".leaflet-partially-editable-polyline-point")).toHaveCount(0); await expect(page.locator(".tilia-track-editor-draft")).toHaveCount(0);
  await expect(page.locator(".leaflet-overlay-pane path[stroke-dasharray='5,1']")).toHaveCount(0);
  await page.evaluate(()=>window.phase4j.app.use("x-track-editor")); await expect(page.getByRole("button",{name:"Track editor",exact:true})).toBeVisible();
});
test("4J-C unresolved vendor helper residue quarantines uninstall and prohibits successful reinstall",async({page})=>{
  await editorSession(page); await dragMarker(page,".leaflet-partially-editable-polyline-point",10,10,{release:false});
  const result=await page.evaluate(async()=>{
    const {app,map}=window.phase4j, original=map.removeLayer;
    let attempts=0;
    // Test-only fault injection at Leaflet's public removal API; no vendor internals.
    map.removeLayer=function(layer){if(layer.options?.dashArray==="5,1"){attempts++;throw new Error("injected helper removal failure");}return original.call(this,layer);};
    let cleanup,reinstall,retry;
    try{await app.unuse("x-track-editor");}catch(error){cleanup=error.code;}
    try{await app.use("x-track-editor");}catch(error){reinstall=error.code;}
    const first=attempts; try{await app.unuse("x-track-editor");}catch(error){retry=error.code;}
    map.removeLayer=original;
    return {cleanup,reinstall,retry,first,attempts,discoverable:app.listPlugins().includes("x-track-editor"),residual:document.querySelectorAll(".leaflet-overlay-pane path[stroke-dasharray='5,1']").length};
  }); await page.mouse.up();
  expect(result).toMatchObject({cleanup:"PLUGIN_TEARDOWN_FAILED",reinstall:"PLUGIN_QUARANTINED",retry:"PLUGIN_TEARDOWN_FAILED",discoverable:false}); expect(result.first).toBe(result.attempts); expect(result.residual).toBeGreaterThan(0);
});

test("4J-C overlapping draft geometry preserves popup and shell-control interaction", async ({ page }) => {
  await editorSession(page, { overlap: true });
  const before = await page.evaluate(async () => {
    const { Popup } = await import("leaflet");
    const { map } = window.phase4j;
    const button = document.createElement("button");
    button.textContent = "Popup probe";
    window.popupClicks = 0;
    button.addEventListener("click", () => window.popupClicks++);
    new Popup({ autoPan: false, closeOnClick: false }).setLatLng([35.681, 139.761]).setContent(button).openOn(map);
    return map.getZoom();
  });
  await page.getByRole("button", { name: "Popup probe", exact: true }).click();
  expect(await page.evaluate(() => window.popupClicks)).toBe(1);
  await page.locator(".leaflet-control-zoom-in").click();
  await expect.poll(() => page.evaluate(() => window.phase4j.map.getZoom())).toBe(before + 1);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Popup probe", exact: true })).toBeVisible();
});
