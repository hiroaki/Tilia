import { describe, expect, it, vi } from "vitest";
vi.mock("leaflet", () => import("./helpers/leaflet-ui.js"));
import { createScopeController } from "../src/ownership/index.js";
import { createSelectionOverlay } from "../plugins/x-track-editor/selection-overlay.js";
import { settle } from "./helpers/scoped-dom.js";
it("owns noninteractive selection-band rings and withdraws old rings on replacement/closure", async () => {
  const controller = createScopeController(); await controller.commit(); const scope = controller.scope.child();
  const map = { layers: new Set() }, attachments = [];
  const context = { map: { attachLayer(marker, options) {
    attachments.push(options); marker.addTo(map); return { dispose: () => marker.remove() };
  } } };
  const overlay = createSelectionOverlay({context,scope});
  overlay.sync([{pointId:"one",point:{lat:1,lon:2}},{pointId:"two",point:{lat:3,lon:4}}],{focusedPointId:"two"});
  expect(map.layers.size).toBe(2); expect(attachments).toEqual([{band:"selection"},{band:"selection"}]);
  expect([...map.layers][1].options.icon.options.className).toContain("focused");
  expect([...map.layers].every(marker => !marker.options.interactive && !marker.options.keyboard)).toBe(true);
  overlay.sync([{pointId:"new",point:{lat:5,lon:6}}]); await settle(); expect(map.layers.size).toBe(1);
  await scope.dispose(); expect(map.layers.size).toBe(0); overlay.sync([{point:{lat:7,lon:8}}]); expect(map.layers.size).toBe(0);
  await controller.close();
});
