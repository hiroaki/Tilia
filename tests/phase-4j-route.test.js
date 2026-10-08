import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("leaflet", () => import("./helpers/leaflet-ui.js"));
import { uiFixture, byClass, settle } from "./helpers/production-ui.js";
import { builtinPluginCatalog } from "../src/builtins.js";
import gpxPlugin from "../src/plugins/domains/gpx.js";
import { requestPhloemRoutes } from "../plugins/x-route-search/client.js";
let f;
afterEach(async () => { await f?.close(); f = null; vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const route = { geometry: { type: "LineString", coordinates: [[139.76,35.68],[139.77,35.69]] }, distance_meters: 1000, duration_seconds: 100, provider: "fixture" };
const response = (count = 1) => new Response(JSON.stringify({ routes: Array.from({ length: count }, () => route) }));
function form() {
  f.click("Route search");
  const inputs = byClass(f.map.container,"tilia-route-search-point-input");
  inputs[0].value = "35.68,139.76"; inputs[1].value = "35.69,139.77";
  inputs.forEach(input => input.dispatchEvent(new Event("input")));
}
const search = () => byClass(f.map.container,"tilia-route-search-search")[0].dispatchEvent(new Event("click"));
describe("Phase 4J-B installed Route Search", () => {
  it("automatically creates alternatives with Start/Goal waypoints, preserves outputs and cleans markers on uninstall", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(2)));
    f = await uiFixture(["x-route-search"]); form(); search(); await settle();
    const entries = f.app.entries.list(); expect(entries).toHaveLength(2);
    const document = f.app.domains.gpx.getDocument(entries[0].id).document;
    expect(document.tracks).toHaveLength(1); expect(document.routes).toHaveLength(0);
    expect(document.waypoints.map(point => point.name)).toEqual(["Start", "Goal"]);
    expect(document.tracks[0].segments[0].points[0]).toMatchObject({ elevation: null, timestamp: null });
    expect(f.map.fitBounds).toHaveBeenCalledOnce(); expect([...f.map.layers].filter(layer => layer.options.draggable).length).toBe(2);
    byClass(f.map.container,"tilia-route-search-close")[0].click(); await settle(); expect([...f.map.layers].filter(layer => layer.options.draggable).length).toBe(2);
    await f.app.unuse("x-route-search"); expect([...f.map.layers].filter(layer => layer.options.draggable).length).toBe(0); expect(f.app.entries.list()).toHaveLength(2);
  });
  it("supersedes a noncooperative fetch without late publication, then uninstalls without joining another plain response", async () => {
    const releases = [];
    const fetch = vi.fn(() => new Promise(resolve => releases.push(resolve))); vi.stubGlobal("fetch", fetch);
    f = await uiFixture(["x-route-search"]); form(); search(); await settle(); search(); await settle();
    expect(fetch).toHaveBeenCalledTimes(2); expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    releases[1](response()); await settle(); releases[0](response(3)); await settle();
    expect(f.app.entries.list()).toHaveLength(1);
    search(); await settle(); const old = byClass(f.map.container,"tilia-route-search-search")[0];
    await f.app.unuse("x-route-search"); expect(fetch.mock.calls[2][1].signal.aborted).toBe(true);
    releases[2](response()); old.click(); await settle(); expect(f.app.entries.list()).toHaveLength(1); expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("keeps the first committed alternative when second creation fails", async () => {
    let creates = 0;
    const builtins = builtinPluginCatalog.map(item => item.id !== "tilia-gpx-domain" ? item : { ...item, load: async () => ({ default: {
      ...gpxPlugin, setup(context) { gpxPlugin.setup({ ...context, domains: { ...context.domains, provide(key, provider) {
        context.domains.provide(key, { ...provider, prepareCreate(input) { if (++creates === 2) throw new Error("second create failed"); return provider.prepareCreate(input); } });
      } } }); }
    } }) });
    vi.stubGlobal("fetch", vi.fn(async () => response(3)));
    f = await uiFixture(["x-route-search"], { builtins }); form(); search(); await settle();
    expect(f.app.entries.list()).toHaveLength(1); expect(creates).toBe(2);
    expect(byClass(f.map.container,"tilia-route-search-error")[0].textContent).toContain("1 route(s) already imported");
  });
  it("pre-abort performs no fetch and caller cancellation stays distinct from timeout", async () => {
    const controller = new AbortController(); controller.abort("caller"); const fetchImpl = vi.fn();
    const args = { endpoint: "/route", profile: "car", points: [{ lat: 0, lon: 0 }, { lat: 1, lon: 1 }], fetchImpl, signal: controller.signal };
    await expect(requestPhloemRoutes(args)).rejects.toMatchObject({ code: "route_cancelled", cause: "caller" }); expect(fetchImpl).not.toHaveBeenCalled();
    const live = new AbortController(); let release;
    const result = requestPhloemRoutes({ ...args, signal: live.signal, fetchImpl: () => new Promise(resolve => { release = resolve; }) });
    live.abort("uninstall"); release(response()); await expect(result).rejects.toMatchObject({ code: "route_cancelled", cause: "uninstall" });
  });
});
