import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("leaflet", () => import("./helpers/leaflet-ui.js"));
import { uiFixture, byClass, settle } from "./helpers/production-ui.js";
let f; afterEach(async () => { await f?.close(); f = null; });
describe("catalog-driven base map control", () => {
  it("groups providers, retains hidden current metadata and restores selected value on failure", async () => {
    f = await uiFixture(["tilia-base-maps-control"]);
    const register = (id, values = {}) => ({ id: `x-${id}`, setup(context) { context.baseMaps.register({ id, label: id, provider: "test", createLayer: () => ({ addTo() {}, remove() {} }), ...values }); } });
    await f.app.use(register("hidden", { visibleInSelector: false })); f.context.baseMaps.select("hidden");
    await f.app.use(register("first")); await f.app.use(register("second", { createLayer() { throw new Error("layer failed"); } }));
    const select = byClass(f.map.container, "tilia-base-map-select")[0];
    expect(select.children[0].textContent).toBe("hidden (current)"); expect(select.children[1].tagName).toBe("OPTGROUP");
    select.value = "second"; select.dispatchEvent(new Event("change")); await settle();
    expect(f.context.baseMaps.getSelected().id).toBe("hidden"); expect(select.children[0].selected).toBe(true);
    await f.app.unuse("x-hidden"); expect(f.context.baseMaps.getSelected().id).toBe("osm");
    await f.app.unuse("tilia-base-maps-control"); expect(byClass(f.map.container, "tilia-base-map-control")).toHaveLength(0);
  });
});
