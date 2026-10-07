import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("leaflet", () => import("./helpers/leaflet-ui.js"));
import { uiFixture, settle } from "./helpers/production-ui.js";
let f; afterEach(async () => { await f?.close(); f = null; vi.unstubAllGlobals(); });
describe("own-commit query startup", () => {
  it("waits for handler publication, attempts only once, and never installs handlers", async () => {
    vi.stubGlobal("window", { location: { search: "?gpx=https://example.com/a.bin&gpx=https://example.com/b.gpx", href: "https://example.com/" } });
    const fetch = vi.fn(async () => new Response("x")); vi.stubGlobal("fetch", fetch);
    f = await uiFixture(["tilia-query-import"]); expect(fetch).not.toHaveBeenCalled();
    await f.app.use({ id: "x-handler", setup(context) { context.inputs.register({id:"test", recognize:()=>false, handle:vi.fn()}); } }); await settle();
    expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0][0]).toBe("https://example.com/a.bin"); expect(f.app.entries.list()).toHaveLength(0);
    await f.app.unuse("x-handler"); await f.app.use({ id: "x-second", setup(context) { context.inputs.register({id:"second", recognize:()=>true, handle:vi.fn()}); } }); await settle(); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("uninstall while waiting revokes its subscription", async () => {
    vi.stubGlobal("window", {location:{search:"?gpx=https://example.com/a.gpx"}}); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    f = await uiFixture(["tilia-query-import"]); await f.app.unuse("tilia-query-import");
    await f.app.use({id:"x-input",setup(c){c.inputs.register({id:"test",recognize:()=>true,handle:vi.fn()});}}); await settle(); expect(fetch).not.toHaveBeenCalled();
  });
  it("no parameter and setup rollback cause no network", async () => {
    vi.stubGlobal("fetch", vi.fn()); f = await uiFixture(["tilia-query-import"]); await settle(); expect(fetch).not.toHaveBeenCalled();
  });
});
