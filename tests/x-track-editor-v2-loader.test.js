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

import { trackEditorV2Plugin } from "../plugins/x-track-editor-v2/loader.js";

describe("x-track-editor-v2 plugin definition", () => {
  it("keeps the v2 editor separate from the existing plugin and declares its UI dependencies", () => {
    expect(trackEditorV2Plugin.id).toBe("x-track-editor-v2");
    expect(trackEditorV2Plugin.requires).toEqual(["tilia-panel", "tilia-status"]);
    expect(trackEditorV2Plugin.stylesheets).toHaveLength(2);
    expect(typeof trackEditorV2Plugin.setup).toBe("function");
  });
});
