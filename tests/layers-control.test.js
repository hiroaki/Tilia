import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/map/controls.js", () => ({
  createButton: vi.fn(),
  createPanel: vi.fn(),
  createSelect: vi.fn(),
  installMapControl: vi.fn(),
}));

vi.mock("../src/map/layers.js", () => ({
  createPhotoThumbnailNode: vi.fn(() => null),
}));

function createDocumentStub() {
  return {
    createElement(tagName) {
      return {
        tagName,
        className: "",
        style: {},
        attributes: {},
        title: "",
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
      };
    },
  };
}

describe("createTrackStyleSwatch", () => {
  const originalDocument = globalThis.document;

  beforeEach(() => {
    globalThis.document = createDocumentStub();
  });

  afterEach(() => {
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }
  });

  it("creates a color swatch for GPX entries from the assigned preset", async () => {
    const { createTrackStyleSwatch } = await import("../src/plugins/ui/layers-control.js");

    const swatch = createTrackStyleSwatch({
      kind: "gpx",
      presentation: { trackStylePresetIndex: 3 },
    });

    expect(swatch.className).toBe("tilia-layer-style-chip");
    expect(swatch.style.backgroundColor).toBe("#d1495b");
    expect(swatch.attributes["aria-hidden"]).toBe("true");
  });

  it("returns null for non-track entries", async () => {
    const { createTrackStyleSwatch } = await import("../src/plugins/ui/layers-control.js");

    expect(createTrackStyleSwatch({ kind: "photo" })).toBeNull();
  });
});