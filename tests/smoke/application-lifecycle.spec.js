import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function fixture(page) {
  await page.route("**/tiles/**", route => route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/hfkAAAAASUVORK5CYII=", "base64") }));
  await page.goto("/tests/fixtures/application-lifecycle.html");
  await page.waitForFunction(() => window.fixtureReady);
}
const data = { tracks: [{ segments: [{ points: [{ lat: 35.68, lon: 139.755 }, { lat: 35.68, lon: 139.765 }, { lat: 35.685, lon: 139.77 }] }] }] };

for (const canvas of [false, true]) test(`public destroy and distinct-Map same-container recreation (${canvas ? "Canvas" : "SVG"})`, async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await fixture(page);
  const result = await page.evaluate(async ({ canvas, data }) => {
    const f = window.lifecycle, original = f.container, maps = [];
    let pageClicks = 0;
    document.getElementById("sentinel").addEventListener("click", () => pageClicks++);
    const cycles = [];
    for (let index = 0; index < 2; index++) {
      const app = f.create({ baseMapOptions: { tileUrl: "/tiles/{z}/{x}/{y}.png", center: [35.68,139.76], zoom: 13, mapOptions: { preferCanvas: canvas } } });
      await app.ready;
      const map = app.map; maps.push(map);
      const entry = await app.domains.gpx.create(data);
      while (app.rendering.getStatus(entry.id)?.state !== "active") await new Promise(resolve => setTimeout(resolve, 0));
      const rawEffect = new f.Polyline([[35.68,139.76],[35.69,139.77]]).addTo(map);
      const events = [];
      const originalRemove = map.remove.bind(map);
      // Instrument the public method only; no Leaflet private mutation.
      map.remove = () => { events.push(["map", original.querySelectorAll(".tilia-map-control,.tilia-ui-surface-root").length]); return originalRemove(); };
      const cached = app.entries;
      const closing = app.destroy();
      const shared = app.destroy() === closing;
      let fenced = false;
      try { cached.list(); } catch { fenced = true; }
      await closing;
      document.getElementById("sentinel").click();
      cycles.push({ shared, fenced, events, oldMapLayer: map.hasLayer(rawEffect), roots: original.querySelectorAll(".tilia-ui-surface-root,.tilia-map-control,.leaflet-pane,.leaflet-control-container").length, sameContainer: original === f.container, caller: original.dataset.caller, css: original.style.getPropertyValue("--caller-value") });
    }
    return { cycles, distinct: maps[0] !== maps[1], pageClicks };
  }, { canvas, data });
  expect(result.distinct).toBe(true); expect(result.pageClicks).toBe(2);
  for (const cycle of result.cycles) expect(cycle).toEqual({ shared: true, fenced: true, events: [["map", 0]], oldMapLayer: false, roots: 0, sameContainer: true, caller: "preserve", css: "42" });
  expect(errors).toEqual([]);
});

test("application destruction ends active native editor drag and document handlers", async ({ page }) => {
  await page.addInitScript(() => {
    const records = new Map(), add = document.addEventListener, remove = document.removeEventListener;
    const capture = options => typeof options === "boolean" ? options : Boolean(options?.capture);
    document.addEventListener = function(type, callback, options) {
      const result = add.call(this, type, callback, options);
      if (/^pointer(move|up|cancel)$/.test(type)) { if (!records.has(type)) records.set(type, new Map()); const callbacks = records.get(type); if (!callbacks.has(callback)) callbacks.set(callback, new Set()); callbacks.get(callback).add(capture(options)); }
      return result;
    };
    document.removeEventListener = function(type, callback, options) {
      const result = remove.call(this, type, callback, options); const callbacks = records.get(type); callbacks?.get(callback)?.delete(capture(options)); if (!callbacks?.get(callback)?.size) callbacks?.delete(callback); return result;
    };
    window.pointerSummary = () => [...records].flatMap(([type, callbacks]) => [...callbacks].map(([fn, flags]) => ({ type, name: fn.name, fn: String(fn).slice(0, 240), flags: [...flags] })));
    window.pointerCount = () => [...records.values()].reduce((sum, callbacks) => sum + [...callbacks.values()].reduce((n, values) => n + values.size, 0), 0);
  });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await fixture(page);
  const baseline = await page.evaluate(() => { window.pageMap = window.lifecycle.createPageMap(); return window.pointerSummary(); });
  expect(baseline.map(record => [record.type, record.name, record.flags])).toEqual([["pointermove", "_onUpdate", [true]], ["pointerup", "_onDelete", [true]], ["pointercancel", "_onDelete", [true]]]);
  await page.evaluate(async data => {
    const app = window.lifecycle.create(); await app.ready;
    const entry = await app.domains.gpx.create(data);
    await app.selection.request(app.domains.gpx.selection.createCandidate(entry.id, { kind: "track", trackIndex: 0 }));
  }, data);
  await page.getByRole("button", { name: "Track editor", exact: true }).click();
  await page.getByRole("button", { name: "Start Edit", exact: true }).click();
  await page.evaluate(() => window.lifecycle.app.map.fire("click", { latlng: { lat: 35.68, lng: 139.76 } }));
  const marker = page.locator(".leaflet-partially-editable-polyline-point").first();
  await expect(marker).toBeVisible();
  const box = await marker.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + 35, box.y + 30, { steps: 4 });
  expect(await page.evaluate(() => window.pointerCount())).toBeGreaterThan(baseline.length);
  await page.evaluate(() => window.lifecycle.app.destroy());
  await page.mouse.up();
  expect(await page.evaluate(() => window.pointerSummary())).toEqual(baseline);
  expect(await page.evaluate(() => { window.pageMap.setView([35.7,139.8], 12); return window.pageMap.getCenter().lat; })).toBeCloseTo(35.7);
  await expect(page.locator("#map .leaflet-pane,#map .tilia-ui-surface-root")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("immediate public destroy blocks startup and GPX-only construction never requests Photo/exifr", async ({ page }) => {
  const requested = []; page.on("request", request => requested.push(request.url()));
  await fixture(page);
  const result = await page.evaluate(async () => {
    const f = window.lifecycle;
    const first = f.create(); const readyError = first.ready.catch(error => error.code);
    await first.destroy();
    const app = f.create({ plugins: ["tilia-gpx-domain", "tilia-gpx-renderer", "tilia-gpx-input"] }); await app.ready; await app.destroy();
    return { readyError: await readyError, roots: f.container.children.length };
  });
  expect(result).toEqual({ readyError: "APP_DESTROYED", roots: 0 });
  expect(requested.filter(url => /\/photo\/|(?:domains|renderers|ui)\/photo\.js|exifr/.test(url))).toEqual([]);
});

test("destroy during rectangle capture releases the pointer and removes gesture resources", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await fixture(page);
  await page.evaluate(async data => {
    const app = window.lifecycle.create(); await app.ready;
    await app.domains.gpx.create(data);
    document.addEventListener("pointerdown", event => window.lastPointer = event.pointerId, true);
  }, data);
  await page.getByRole("button", { name: "Track editor", exact: true }).click();
  await page.getByRole("button", { name: "Start Edit", exact: true }).click();
  await page.evaluate(() => window.lifecycle.app.map.fire("click", { latlng: { lat: 35.68, lng: 139.76 } }));
  await page.getByRole("button", { name: "Select area", exact: true }).click();
  const box = await page.locator("#map").boundingBox();
  await page.mouse.move(box.x + 400, box.y + 300); await page.mouse.down();
  await page.mouse.move(box.x + 480, box.y + 370);
  await expect(page.locator(".tilia-track-editor-selection-rectangle")).toHaveCount(1);
  expect(await page.evaluate(() => window.lifecycle.container.hasPointerCapture(window.lastPointer))).toBe(true);
  await page.evaluate(() => window.lifecycle.app.destroy()); await page.mouse.up();
  expect(await page.evaluate(() => window.lifecycle.container.hasPointerCapture(window.lastPointer))).toBe(false);
  await expect(page.locator(".tilia-track-editor-selection-shield,.tilia-track-editor-selection-rectangle,.tilia-track-editor-draft")).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const kind of ["route", "remote GPX"]) test(`destroy aborts pending ${kind} and late response cannot publish into a recreated app`, async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await fixture(page);
  await page.evaluate(async kind => {
    const native = window.fetch;
    window.fetch = (url, options) => {
      if (String(url).includes(kind === "route" ? "/route" : "/held.gpx")) {
        window.heldSignal = options.signal;
        return new Promise(resolve => window.releaseResponse = () => {
          window.responseReleased = true;
          resolve(new Response(kind === "route" ? JSON.stringify({ route: { geometry: { type: "LineString", coordinates: [[139.76,35.68],[139.77,35.69]] }, distance_meters: 1000, duration_seconds: 100, provider: "controlled" } }) : '<gpx version="1.1"><trk><trkseg><trkpt lat="35.68" lon="139.76"/><trkpt lat="35.69" lon="139.77"/></trkseg></trk></gpx>', { status: 200, headers: { "content-type": kind === "route" ? "application/json" : "application/gpx+xml" } }));
        });
      }
      return native(url, options);
    };
    const app = window.lifecycle.create(); await app.ready;
    if (kind !== "route") await app.use("tilia-url-import");
  }, kind);
  if (kind === "route") {
    await page.getByRole("button", { name: "Route search", exact: true }).click();
    await page.getByRole("textbox", { name: "Start coordinates" }).fill("35.68,139.76");
    await page.getByRole("textbox", { name: "Goal coordinates" }).fill("35.69,139.77");
    await page.getByRole("button", { name: "Search Routes", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Load URL", exact: true }).click();
    await page.getByRole("textbox", { name: "Remote file URL" }).fill("http://127.0.0.1:4173/held.gpx");
    await page.getByRole("button", { name: "Load", exact: true }).click();
  }
  await page.waitForFunction(() => window.heldSignal);
  const result = await page.evaluate(async () => {
    await window.lifecycle.app.destroy();
    const aborted = window.heldSignal.aborted;
    const fresh = window.lifecycle.create({ plugins: ["tilia-gpx-domain"] }); await fresh.ready;
    window.releaseResponse();
    return aborted;
  });
  expect(result).toBe(true);
  await page.waitForFunction(() => window.responseReleased);
  // A macrotask turn also flushes the late response/parse continuations.
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
  expect(await page.evaluate(() => window.lifecycle.app.entries.list())).toEqual([]);
  await expect(page.locator(".tilia-route-search-result,.tilia-url-floating-panel")).toHaveCount(0);
  await page.evaluate(() => window.lifecycle.app.destroy()); expect(errors).toEqual([]);
});

test("destroy revokes an exported URL and cancels its pending revoke timer", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await fixture(page);
  await page.evaluate(async data => { const app = window.lifecycle.create(); await app.ready; await app.domains.gpx.create(data); }, data);
  await page.getByRole("button", { name: "GPX export", exact: true }).click();
  const result = await page.evaluate(async () => {
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    const nativeSet = window.setTimeout, nativeClear = window.clearTimeout;
    const live = new Set(), timers = new Map(); let serial = 900000, revoked = 0;
    URL.createObjectURL = blob => { const url = create(blob); live.add(url); return url; };
    URL.revokeObjectURL = url => { if (live.delete(url)) revoked++; revoke(url); };
    window.setTimeout = (callback, delay, ...args) => delay === 0 ? (timers.set(++serial, () => callback(...args)), serial) : nativeSet(callback, delay, ...args);
    window.clearTimeout = id => { timers.delete(id); nativeClear(id); };
    document.querySelector(".tilia-gpx-export-action").click();
    const before = { urls: live.size, timers: timers.size, anchors: document.querySelectorAll(".tilia-gpx-export-download").length };
    await window.lifecycle.app.destroy();
    window.setTimeout = nativeSet; window.clearTimeout = nativeClear;
    const after = { urls: live.size, timers: timers.size, anchors: document.querySelectorAll(".tilia-gpx-export-download").length, revoked };
    return { before, after };
  });
  expect(result).toEqual({ before: { urls: 1, timers: 1, anchors: 1 }, after: { urls: 0, timers: 0, anchors: 0, revoked: 1 } });
  expect(errors).toEqual([]);
});

test("Photo preview and styles are removed per app while an independent app and page style survive", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await fixture(page);
  const result = await page.evaluate(async () => {
    const { createDefaultTiliaApp } = await import("/src/index.js");
    const live = new Set(), create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = create(blob); live.add(url); return url; };
    URL.revokeObjectURL = url => { live.delete(url); revoke(url); };
    const caller = document.createElement("style"); caller.textContent = "#sentinel { color: rgb(1, 2, 3); }"; document.head.appendChild(caller);
    const plugins = ["tilia-photo-domain", "tilia-photo-renderer", "tilia-photo-ui", "tilia-map-selection-presenter"];
    const left = window.lifecycle.create({ plugins }); await left.ready;
    const node = document.createElement("div"); node.style.cssText = "width:300px;height:200px"; document.body.appendChild(node);
    const right = createDefaultTiliaApp(node, { plugins, baseMapOptions: { tileUrl: "/tiles/{z}/{x}/{y}.png" } }); await right.ready;
    const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/hfkAAAAASUVORK5CYII="), c => c.charCodeAt(0));
    const value = { data: { name: "preview", coordinate: { lat: 35.68, lon: 139.76 } }, blob: new Blob([bytes], { type: "image/png" }) };
    const entry = await left.domains.photo.create(value), other = await right.domains.photo.create(value);
    await left.selection.request(left.domains.photo.selection.createCandidate(entry.id));
    const preview = left.domains.photo.getPreview(entry.id);
    const before = { urls: live.size, styles: document.querySelectorAll('[data-tilia-stylesheet="tilia-core-ui"]').length, preview: preview.isCurrent() };
    const closing = left.destroy(); const fenced = preview.isCurrent(); await closing;
    const middle = { urls: live.size, styles: document.querySelectorAll('[data-tilia-stylesheet="tilia-core-ui"]').length, rightEntry: right.entries.get(other.id)?.id, caller: caller.isConnected, fenced };
    await right.destroy();
    return { before, middle, after: { urls: live.size, styles: document.querySelectorAll("[data-tilia-stylesheet]").length, caller: caller.isConnected } };
  });
  expect(result).toEqual({ before: { urls: 2, styles: 2, preview: true }, middle: { urls: 1, styles: 1, rightEntry: 1, caller: true, fenced: false }, after: { urls: 0, styles: 0, caller: true } });
  expect(errors).toEqual([]);
});


test("public destroy does not join pinned EXIF readers and their late settlement cannot create a Photo URL", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    const Native = window.FileReader;
    window.exifAudit = { hold: true, readers: [], release: [], aborts: 0, urls: 0 };
    window.FileReader = class extends Native {
      constructor() { super(); window.exifAudit.readers.push(this); }
      set onloadend(callback) { super.onloadend = event => { if (window.exifAudit.hold) window.exifAudit.release.push(() => callback(event)); else callback(event); }; }
      abort() { window.exifAudit.aborts++; return super.abort(); }
    };
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => { window.exifAudit.urls++; return create(blob); };
  });
  await fixture(page);
  const bytes = await readFile(new URL("../fixtures/photo-exif.jpg", import.meta.url));
  await page.evaluate(async encoded => {
    const app = window.lifecycle.create({ plugins: ["tilia-jpeg-input"] }); await app.ready;
    const file = new File([Uint8Array.from(atob(encoded), c => c.charCodeAt(0))], "held.jpg", { type: "image/jpeg" });
    window.pendingPhoto = app.load(file).then(() => "unexpected success", error => error.code);
  }, bytes.toString("base64"));
  await page.waitForFunction(() => window.exifAudit.release.length > 0);
  const before = await page.evaluate(async () => {
    await window.lifecycle.app.destroy();
    return { pending: window.exifAudit.release.length, aborts: window.exifAudit.aborts, urls: window.exifAudit.urls, roots: window.lifecycle.container.children.length };
  });
  expect(before).toMatchObject({ aborts: 0, urls: 0, roots: 0 }); expect(before.pending).toBeGreaterThan(0);
  const result = await page.evaluate(async () => {
    window.exifAudit.hold = false; window.exifAudit.release.splice(0).forEach(release => release());
    const outcome = await window.pendingPhoto;
    return { outcome, urls: window.exifAudit.urls, readersDone: window.exifAudit.readers.every(reader => reader.readyState === FileReader.DONE), roots: window.lifecycle.container.children.length };
  });
  expect(result).toEqual({ outcome: "INPUT_DISPATCH_CANCELLED", urls: 0, readersDone: true, roots: 0 });
  expect(errors).toEqual([]);
});

test("destroy joins pending source-independent Save Copy handoff without recreating editor UI", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await fixture(page);
  await page.evaluate(async data => {
    const { builtins } = await import("/src/index.js");
    const catalog = builtins.map(metadata => metadata.id !== "tilia-gpx-domain" ? metadata : { ...metadata, async load() {
      const module = await metadata.load(), plugin = module.default ?? module;
      return { default: { ...plugin, setup(context, options) {
        plugin.setup({ ...context, domains: { ...context.domains, provide(key, provider) {
          context.domains.provide(key, { ...provider, async prepareCreate(input) {
            const prepared = await provider.prepareCreate(input);
            if (input.value.name?.includes("edited")) {
              window.saveSignal = input.signal;
              await new Promise(resolve => window.releaseSave = resolve);
            }
            return prepared;
          } });
        } } }, options);
      } } };
    } });
    const app = window.lifecycle.create({ builtins: catalog }); await app.ready;
    window.source = await app.domains.gpx.create({ ...data, name: "source.gpx" });
    const map = app.map, remove = map.remove.bind(map);
    window.mapRemoved = false; map.remove = () => { window.mapRemoved = true; return remove(); };
  }, data);
  await page.getByRole("button", { name: "Track editor", exact: true }).click();
  await page.getByRole("button", { name: "Start Edit", exact: true }).click();
  await page.evaluate(() => window.lifecycle.app.map.fire("click", { latlng: { lat: 35.68, lng: 139.76 } }));
  await page.evaluate(() => window.lifecycle.app.entries.remove(window.source.id));
  await page.getByRole("button", { name: "Save Copy", exact: true }).click();
  await page.waitForFunction(() => window.releaseSave);
  await page.evaluate(() => { window.destroyDone = false; window.closing = window.lifecycle.app.destroy().then(() => window.destroyDone = true); });
  expect(await page.evaluate(() => ({ aborted: window.saveSignal.aborted, done: window.destroyDone, map: window.mapRemoved }))).toEqual({ aborted: true, done: false, map: false });
  await page.evaluate(async () => { window.releaseSave(); await window.closing; });
  expect(await page.evaluate(() => ({ done: window.destroyDone, map: window.mapRemoved }))).toEqual({ done: true, map: true });
  await expect(page.locator(".tilia-track-editor-panel,.tilia-track-editor-draft,.tilia-ui-surface-root,.leaflet-pane")).toHaveCount(0);
  expect(errors).toEqual([]);
});
