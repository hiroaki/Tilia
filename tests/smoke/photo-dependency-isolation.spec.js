import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("GPX works without a resolvable EXIF provider; JPEG failure stays local across reinstall", async ({ page }) => {
  const requested = [];
  const errors = [];
  page.on("request", request => requested.push(request.url()));
  page.on("pageerror", error => errors.push(error.message));
  let gpxRequests;
  await page.exposeFunction("recordGpxPhase", () => {
    gpxRequests = [...requested];
  });
  // Only the served fixture changes: the normal installation is untouched.
  const html = await readFile(new URL("../fixtures/application-lifecycle.html", import.meta.url), "utf8");
  const exifrMapping = ',"exifr":"/tests/fixtures/exifr-7.1.3-lite.esm.js"';
  expect(html).toContain(exifrMapping);
  const htmlWithoutExif = html.replace(exifrMapping, "");
  expect(htmlWithoutExif).not.toContain(exifrMapping);
  await page.route("**/tests/fixtures/application-lifecycle.html", route => route.fulfill({
    contentType: "text/html",
    body: htmlWithoutExif,
  }));
  await page.route("**/tiles/**", route => route.abort());
  await page.goto("/tests/fixtures/application-lifecycle.html");
  await page.waitForFunction(() => window.fixtureReady);
  const gpx = await readFile(new URL("../fixtures/sample-track.gpx", import.meta.url), "utf8");
  const result = await page.evaluate(async gpx => {
    const app = window.lifecycle.create({ plugins: ["tilia-gpx-input"] });
    await app.ready;
    const image = new File(["jpeg"], "photo.jpg", { type: "image/jpeg" });
    const failure = async () => {
      try {
        await app.load(image);
        return null;
      } catch (error) {
        return { code: error.code, handler: error.details?.handlerId, cause: error.cause?.message };
      }
    };
    await app.load(new File([gpx], "track.gpx", { type: "application/gpx+xml" }));
    if (app.entries.list().length !== 1) throw new Error("GPX did not publish an entry");
    const unsupported = await failure();
    const initial = app.listPlugins();
    await app.destroy();
    const roots = window.lifecycle.container.children.length;
    await window.recordGpxPhase();
    const photoApp = window.lifecycle.create({ plugins: ["tilia-gpx-input", "tilia-jpeg-input"],
      pluginOptions: { "tilia-photo-domain": { createObjectURL() { throw new Error("unexpected preview acquisition"); } } } });
    await photoApp.ready;
    const failures = [];
    for (let cycle = 0; cycle < 2; cycle++) {
      try {
        await photoApp.load(image);
      } catch (error) {
        failures.push({ code: error.code, handler: error.details?.handlerId, cause: error.cause?.message });
      }
      if (photoApp.entries.list().length) throw new Error("failed JPEG published an entry");
      await photoApp.unuse("tilia-jpeg-input");
      let unsupportedAfterRemoval = false;
      try {
        await photoApp.load(image);
      } catch (error) {
        if (error.code !== "INPUT_UNSUPPORTED") throw error;
        unsupportedAfterRemoval = true;
      }
      if (!unsupportedAfterRemoval) throw new Error("JPEG handler survived removal");
      await photoApp.use("tilia-jpeg-input");
    }
    await photoApp.load(new File([gpx], "still-works.gpx", { type: "application/gpx+xml" }));
    const count = photoApp.entries.list().length;
    const plugins = photoApp.listPlugins();
    await photoApp.destroy();
    return { unsupported, initial, roots, failures, count, plugins, finalRoots: window.lifecycle.container.children.length };
  }, gpx);
  expect(result.unsupported.code).toBe("INPUT_UNSUPPORTED");
  expect(result.initial).not.toContain("tilia-photo-domain");
  expect(result.plugins).toContain("tilia-photo-domain");
  expect(result.count).toBe(1);
  expect(result.roots).toBe(0);
  expect(result.finalRoots).toBe(0);
  expect(result.failures).toHaveLength(2);
  for (const failure of result.failures) {
    expect(failure.code).toBe("INPUT_DISPATCH_FAILED");
    expect(failure.handler).toBe("tilia-jpeg");
    expect(failure.cause).toContain("exifr");
  }
  expect(requested.filter(url => /exifr/.test(url))).toEqual([]);
  expect(gpxRequests.filter(url => /\/photo\/|\/plugins\/(?:domains|renderers|ui)\/photo\.js|\/input\/jpeg\.js|exifr/.test(url))).toEqual([]);
  expect(errors).toEqual([]);
});
