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
