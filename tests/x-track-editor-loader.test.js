import { describe, expect, it, vi } from "vitest";

vi.mock("leaflet", () => ({
  LatLng: class LatLng {},
  Marker: class Marker {},
  Polyline: class Polyline {},
  DivIcon: class DivIcon {},
  Control: class Control {},
  DomEvent: {},
  DomUtil: {},
}));

import { trackEditorPlugin } from "../plugins/x-track-editor/loader.js";

describe("x-track-editor plugin definition", () => {
  it("declares its UI dependencies", () => {
    expect(trackEditorPlugin.id).toBe("x-track-editor");
    expect(trackEditorPlugin.requires).toEqual(["tilia-panel", "tilia-status"]);
    expect(trackEditorPlugin.stylesheets).toHaveLength(2);
    expect(typeof trackEditorPlugin.setup).toBe("function");
  });
});
