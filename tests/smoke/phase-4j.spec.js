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
