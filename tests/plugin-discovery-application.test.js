import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("leaflet", () => import("./helpers/leaflet-ui.js"));
vi.mock("../src/plugins/runtime/discovery.js", () => ({ loadDirectoryDefinition: vi.fn() }));
import { loadDirectoryDefinition } from "../src/plugins/runtime/discovery.js";
import { normalizeDirectDefinition } from "../src/plugins/runtime/catalog.js";
import { uiFixture } from "./helpers/production-ui.js";
let f;
afterEach(async () => { await f?.close(); f = null; vi.clearAllMocks(); });
describe("application configuration uses the shared discovery runtime", () => {
  it.each([
    { plugins: [["company-plugin", { enabled: true }]], pluginOptions: { "company-plugin": { ignored: true } } },
    { plugins: ["company-plugin"], pluginOptions: { "company-plugin": { enabled: true } } },
    { plugins: [{ plugin: "company-plugin", options: { enabled: true } }] },
  ])("awaits discovery in ready and preserves supported option precedence", async options => {
    const setup = vi.fn();
    loadDirectoryDefinition.mockResolvedValue(normalizeDirectDefinition({ id: "company-plugin", setup }));
    f = await uiFixture(options.plugins, options);
    expect(await f.app.ready).toBe(f.app);
    expect(setup.mock.calls[0][1]).toEqual({ enabled: true });
    await f.app.unuse("company-plugin"); await f.app.use("company-plugin", { enabled: false });
    expect(setup.mock.calls[1][1]).toEqual({ enabled: false });
    expect(loadDirectoryDefinition).toHaveBeenCalledOnce();
  });
  it("preserves replacement catalogs, third-party entries and direct definitions", async () => {
    const load = vi.fn(() => ({ id: "company-explicit", setup() {} }));
    f = await uiFixture(["company-explicit"], { builtins: [{ id: "company-explicit", load }] });
    await expect(f.app.use("tilia-status")).rejects.toMatchObject({ code: "PLUGIN_ID_INVALID" });
    await f.app.use({ id: "vendor-direct", setup() {} });
    expect(load).toHaveBeenCalledOnce(); expect(loadDirectoryDefinition).not.toHaveBeenCalled();
    expect(f.app.hasPlugin("vendor-direct")).toBe(true);
  });
  it("allows external discovery with an empty replacement catalog", async () => {
    loadDirectoryDefinition.mockResolvedValue(normalizeDirectDefinition({ id: "vendor-plugin", setup() {} }));
    f = await uiFixture(["vendor-plugin"], { builtins: [] });
    expect(f.app.hasPlugin("vendor-plugin")).toBe(true);
    await expect(f.app.use("tilia-gpx-domain")).rejects.toMatchObject({ code: "PLUGIN_ID_INVALID" });
  });
});
