import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const leafletMocks = vi.hoisted(() => {
  class MockControl {
    constructor(options = {}) {
      this.options = options;
    }

    addTo(map) {
      this.map = map;
      this._container = this.onAdd();
      return this;
    }
  }

  function createNode(tagName, className = "") {
    return {
      tagName,
      className,
      dataset: {},
      children: [],
      appendChild(child) {
        this.children.push(child);
        return child;
      },
    };
  }

  return {
    MockControl,
    createNode,
  };
});

vi.mock("leaflet", () => ({
  Control: leafletMocks.MockControl,
  DomUtil: {
    create(tagName, className = "", parent = null) {
      const node = leafletMocks.createNode(tagName, className);
      if (parent && typeof parent.appendChild === "function") {
        parent.appendChild(node);
      }
      return node;
    },
  },
  DomEvent: {
    disableClickPropagation: vi.fn(),
    on: vi.fn(),
    disableScrollPropagation: vi.fn(),
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
  },
}));

import { installMapControl } from "../src/map/controls.js";

describe("installMapControl", () => {
  const originalHTMLElement = globalThis.HTMLElement;

  beforeEach(() => {
    globalThis.HTMLElement = class MockHTMLElement {};
  });

  afterEach(() => {
    if (originalHTMLElement === undefined) {
      delete globalThis.HTMLElement;
    } else {
      globalThis.HTMLElement = originalHTMLElement;
    }
  });

  it("normalizes invalid priority and resolves edge policy from normalized value", () => {
    const control = installMapControl({
      map: {},
      priority: "unexpected-priority",
      edgePolicy: "unexpected-edge-policy",
      createContent() {
        return null;
      },
    });

    expect(control._container.dataset.tiliaPriority).toBe("normal");
    expect(control._container.dataset.tiliaEdgePolicy).toBe("yield");
  });

  it("keeps valid priority values and derives default keep policy for high priority", () => {
    const control = installMapControl({
      map: {},
      priority: "high",
      createContent() {
        return null;
      },
    });

    expect(control._container.dataset.tiliaPriority).toBe("high");
    expect(control._container.dataset.tiliaEdgePolicy).toBe("keep");
  });

  it("accepts explicit edge policy override when priority is valid", () => {
    const control = installMapControl({
      map: {},
      priority: "high",
      edgePolicy: "yield",
      createContent() {
        return null;
      },
    });

    expect(control._container.dataset.tiliaPriority).toBe("high");
    expect(control._container.dataset.tiliaEdgePolicy).toBe("yield");
  });
});
