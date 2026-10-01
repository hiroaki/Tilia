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

import {
  recoverSelectionConsistencyFailure,
  trackEditorPlugin,
} from "../plugins/x-track-editor/loader.js";

describe("x-track-editor plugin definition", () => {
  it("declares its UI dependencies", () => {
    expect(trackEditorPlugin.id).toBe("x-track-editor");
    expect(trackEditorPlugin.requires).toEqual(["tilia-panel", "tilia-status"]);
    expect(trackEditorPlugin.stylesheets).toHaveLength(2);
    expect(typeof trackEditorPlugin.setup).toBe("function");
  });

  it("resets editing and reports details after a selection consistency failure", () => {
    const callbacks = {
      reportError: vi.fn(),
      cancelRectangleSelection: vi.fn(),
      detachLocalEditing: vi.fn(),
      clearSelection: vi.fn(),
      syncSelectionPresentation: vi.fn(),
      setStatus: vi.fn(),
    };
    const details = { expectedCount: 2, resolvedCount: 1 };

    recoverSelectionConsistencyFailure({ details, ...callbacks });

    expect(callbacks.reportError).toHaveBeenCalledWith(
      "Track editor selection consistency failure",
      details,
    );
    expect(callbacks.cancelRectangleSelection).toHaveBeenCalledOnce();
    expect(callbacks.detachLocalEditing).toHaveBeenCalledOnce();
    expect(callbacks.clearSelection).toHaveBeenCalledOnce();
    expect(callbacks.syncSelectionPresentation).toHaveBeenCalledOnce();
    expect(callbacks.setStatus).toHaveBeenCalledWith(expect.stringContaining("editing was reset"));
  });
});
