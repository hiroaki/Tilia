import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("leaflet", () => import("./helpers/leaflet-ui.js"));
import { uiFixture, byClass, settle } from "./helpers/production-ui.js";
import { Element } from "./helpers/scoped-dom.js";
let f;
afterEach(async () => { vi.useRealTimers(); await f?.close(); f = null; vi.restoreAllMocks(); });
const data = name => ({ name, metadata: { name }, tracks: [{ segments: [{ points: [{ lat: 0, lon: 0, elevation: 0 }, { lat: 1, lon: 2 }] }] }], routes: [{ points: [{ lat: 3, lon: 4 }] }], waypoints: [{ lat: 5, lon: 6, name: "<&>" }] });
describe("Phase 4J-A production GPX Export", () => {
  it("exports selected hidden semantic data without renderer; owns downloads through uninstall", async () => {
    vi.useFakeTimers();
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:export");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    f = await uiFixture(["x-gpx-export"]);
    const first = await f.app.domains.gpx.create(data("first"));
    const second = await f.app.domains.gpx.create(data("Second.GPX"), { visible: false });
    f.click("GPX export"); await settle();
    const select = byClass(f.map.container, "tilia-gpx-export-select")[0];
    expect(select.children).toHaveLength(2); select.value = "1"; select.dispatchEvent(new Event("change"));
    byClass(f.map.container, "tilia-gpx-export-action")[0].click(); await settle();
    const blob = create.mock.calls[0][0], xml = await blob.text();
    expect(xml).toContain("Second.GPX"); expect(xml).toContain("<rte>"); expect(xml).toContain("<wpt"); expect(xml).toContain("&lt;&amp;&gt;");
    expect(xml).toContain("<ele>0</ele>"); expect(xml.match(/<ele>/g)).toHaveLength(1);
    expect(byClass(f.map.container, "tilia-gpx-export-download")[0].download).toBe("Second.GPX");
    await f.app.unuse("x-gpx-export");
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:export"); expect(vi.getTimerCount()).toBe(0);
    expect(byClass(f.map.container, "tilia-gpx-export-download")).toHaveLength(0);
    expect(f.app.entries.get(first.id)).not.toBeNull(); expect(f.app.entries.get(second.id)).not.toBeNull();
  });
  it("keeps a captured snapshot after reentrant deletion at URL acquisition and reconciles empty choices", async () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    f = await uiFixture(["x-gpx-export"]); const entry = await f.app.domains.gpx.create(data("captured"));
    const create = vi.spyOn(URL, "createObjectURL").mockImplementation(() => { void f.app.entries.remove(entry.id); return "blob:captured"; });
    f.click("GPX export"); await settle(); byClass(f.map.container, "tilia-gpx-export-action")[0].click(); await settle();
    expect(await create.mock.calls[0][0].text()).toContain("captured");
    expect(byClass(f.map.container, "tilia-gpx-export-action")[0].disabled).toBe(true);
    await f.app.unuse("x-gpx-export"); expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:captured");
  });
  it("cleans URL/anchor after click failure without a revoke timer or false completion", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:failure");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = Element.prototype.click;
    vi.spyOn(Element.prototype, "click").mockImplementation(function () { if (this.tagName === "A") throw new Error("download click failed"); return click.call(this); });
    f = await uiFixture(["x-gpx-export"]); await f.app.domains.gpx.create(data("failure"));
    f.click("GPX export"); await settle(); byClass(f.map.container, "tilia-gpx-export-action")[0].click(); await settle();
    expect(revoke).toHaveBeenCalledOnce(); expect(byClass(f.map.container, "tilia-gpx-export-download")).toHaveLength(0);
    expect(byClass(f.map.container, "tilia-gpx-export-message")[0].textContent).toContain("download click failed");
  });
});
