import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRectangleSelection,
  selectPointIdsInContainerBounds,
} from "../plugins/x-track-editor/rectangle-selection.js";

describe("x-track-editor rectangle selection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hit-tests current domain coordinates inclusively and preserves segment order", () => {
    const map = {
      latLngToContainerPoint: ([lat, lon]) => ({ x: lon, y: lat }),
    };
    const domain = {
      points: [
        { id: "first", lat: 10, lon: 10 },
        { id: "second", lat: 15, lon: 15 },
        { id: "boundary", lat: 20, lon: 20 },
        { id: "outside", lat: 21, lon: 21 },
      ],
    };

    expect(selectPointIdsInContainerBounds(map, domain, {
      min: { x: 10, y: 10 },
      max: { x: 20, y: 20 },
    })).toEqual(["first", "second", "boundary"]);
    expect(selectPointIdsInContainerBounds(map, null, null)).toEqual([]);
  });

  it("restores map dragging only when it was enabled before activation", () => {
    class FakeElement extends EventTarget {
      constructor() {
        super();
        this.children = [];
        this.className = "";
      }
      appendChild(child) { this.children.push(child); child.parent = this; }
      remove() {
        if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
      }
      getBoundingClientRect() { return { left: 0, top: 0 }; }
    }
    const fakeDocument = new EventTarget();
    fakeDocument.createElement = () => new FakeElement();
    vi.stubGlobal("document", fakeDocument);

    for (const initiallyEnabled of [true, false]) {
      let enabled = initiallyEnabled;
      const container = new FakeElement();
      const map = {
        getContainer: () => container,
        dragging: {
          enabled: () => enabled,
          disable: vi.fn(() => { enabled = false; }),
          enable: vi.fn(() => { enabled = true; }),
        },
      };
      const rectangleSelection = createRectangleSelection({ map });
      rectangleSelection.activate();
      expect(enabled).toBe(false);
      expect(rectangleSelection.isActive()).toBe(true);
      rectangleSelection.cancel();
      expect(enabled).toBe(initiallyEnabled);
      expect(map.dragging.enable).toHaveBeenCalledTimes(initiallyEnabled ? 1 : 0);
      expect(container.children).toEqual([]);
      rectangleSelection.destroy();
    }
  });
});
