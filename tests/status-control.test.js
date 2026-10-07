import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("leaflet", () => import("./helpers/leaflet-ui.js"));
import { uiFixture, byClass } from "./helpers/production-ui.js";
import { statusServiceKey } from "../src/plugins/contracts/status.js";
let f; afterEach(async () => { await f?.close(); f = null; });
describe("owned status provider", () => {
  it("announces replacement, preserves empty text and redisplays after dismissal", async () => {
    f = await uiFixture(["tilia-status"]); const service = f.context.services.require(statusServiceKey);
    const output = byClass(f.map.container, "tilia-status-text")[0], panel = byClass(f.map.container, "tilia-status-panel")[0];
    expect(output.attributes).toMatchObject({ role: "status", "aria-live": "polite" }); expect(output.textContent).toBe("Ready");
    byClass(panel, "tilia-status-dismiss")[0].click(); expect(panel.classList.contains("tilia-status-panel-dismissed")).toBe(true);
    service.set(""); expect(output.textContent).toBe(""); expect(panel.classList.contains("tilia-status-panel-dismissed")).toBe(false);
    service.set("latest"); expect(output.textContent).toBe("latest");
    await f.app.unuse("tilia-status"); expect(byClass(f.map.container, "tilia-status-control")).toHaveLength(0); expect(() => service.set("stale")).toThrow();
  });
});
