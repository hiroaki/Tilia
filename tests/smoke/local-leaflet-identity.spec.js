import { expect, test } from "@playwright/test";

for (const canvas of [false, true]) test(`Core, host and external plugin share Leaflet (${canvas ? "Canvas" : "SVG"})`, async ({ page }) => {
  const modules = [];
  page.on("request", request => { if (request.resourceType() === "script" && /leaflet\.js(?:$|\?)/.test(request.url())) modules.push(request.url()); });
  await page.route("**/tiles/**", route => route.abort());
  await page.goto("/tests/fixtures/application-lifecycle.html");
  await page.waitForFunction(() => window.fixtureReady);
  const result = await page.evaluate(async canvas => {
    const L = await import("leaflet");
    const direct = await import("/src/map/vendor/leaflet/2.0.0-beta.1/leaflet.js");
    const { PartiallyEditablePolyline } = await import("/plugins/x-track-editor/vendor/leaflet-partially-editable-polyline.js");
    const app = window.lifecycle.create({ plugins: ["tilia-gpx-input", "tilia-gpx-renderer", "x-track-editor"], baseMapOptions: { tileUrl: "/tiles/{z}/{x}/{y}.png", center: [35.68, 139.76], zoom: 13, mapOptions: { renderer: canvas ? new L.Canvas() : new L.SVG() } } });
    await app.ready;
    const layer = new PartiallyEditablePolyline([[35.68, 139.76], [35.69, 139.77]]);
    let borrowedMap;
    await app.use({ id: "x-module-identity", setup(context) { borrowedMap = context.map.advancedLeafletMap(); context.map.attachLayer(layer); } });
    const renderer = app.map.getRenderer(layer);
    const result = { namespace: L === direct, map: app.map instanceof L.Map, borrowed: borrowedMap === app.map, pluginLayer: layer instanceof L.Polyline, attached: app.map.hasLayer(layer), renderer: renderer instanceof (canvas ? L.Canvas : L.SVG) };
    await app.destroy();
    return result;
  }, canvas);
  expect(result).toEqual({ namespace: true, map: true, borrowed: true, pluginLayer: true, attached: true, renderer: true });
  expect(modules).toEqual(["http://127.0.0.1:4173/src/map/vendor/leaflet/2.0.0-beta.1/leaflet.js"]);
});
