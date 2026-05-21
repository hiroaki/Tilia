import { describe, expect, it } from "vitest";
import { TILIA_CONTROL_EDGE_POLICY, TILIA_CONTROL_PRIORITY, TILIA_UI_LAYER } from "../src/ui/protocol.js";
import { createUiSurfaceManager } from "../src/ui/surfaces.js";

function createElement(ownerDocument, tagName) {
  return {
    ownerDocument,
    tagName,
    nodeType: 1,
    className: "",
    dataset: {},
    style: {
      values: {},
      setProperty(name, value) {
        this.values[name] = value;
      },
      removeProperty(name) {
        delete this.values[name];
      },
    },
    children: [],
    parentNode: null,
    offsetWidth: 0,
    offsetHeight: 0,
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    querySelectorAll(selector) {
      const matcher = createSelectorMatcher(selector);
      const results = [];
      collectMatches(this, matcher, results);
      return results;
    },
    remove() {
      if (!this.parentNode) {
        return;
      }
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      this.parentNode = null;
    },
    getBoundingClientRect() {
      return {
        width: this.offsetWidth,
        height: this.offsetHeight,
      };
    },
  };
}

function createSelectorMatcher(selector) {
  const parts = selector.trim().split(".").filter(Boolean);
  const tagName = selector.startsWith(".") ? null : parts.shift()?.toLowerCase() || null;
  const classes = parts;
  return (node) => {
    const nodeTag = String(node.tagName || "").toLowerCase();
    const classNames = String(node.className || "").split(/\s+/).filter(Boolean);
    if (tagName && nodeTag !== tagName) {
      return false;
    }
    return classes.every((className) => classNames.includes(className));
  };
}

function collectMatches(node, matcher, results) {
  for (const child of node.children || []) {
    if (matcher(child)) {
      results.push(child);
    }
    collectMatches(child, matcher, results);
  }
}

function createDocumentStub() {
  const ownerDocument = {
    defaultView: {},
    createElement(tagName) {
      return createElement(ownerDocument, tagName);
    },
  };
  return ownerDocument;
}

describe("createUiSurfaceManager", () => {
  it("creates one root per surface and mounts elements with metadata", () => {
    const ownerDocument = createDocumentStub();
    const mapContainer = createElement(ownerDocument, "div");
    const manager = createUiSurfaceManager({
      map: {
        getContainer() {
          return mapContainer;
        },
      },
    });

    const panelNode = createElement(ownerDocument, "aside");
    const floatingNode = createElement(ownerDocument, "div");

    manager.mount({
      id: "panel",
      surface: TILIA_UI_LAYER.panel,
      element: panelNode,
      priority: TILIA_CONTROL_PRIORITY.normal,
    });
    manager.mount({
      id: "floating",
      surface: TILIA_UI_LAYER.floating,
      element: floatingNode,
      priority: TILIA_CONTROL_PRIORITY.high,
    });

    expect(mapContainer.children).toHaveLength(2);
    expect(mapContainer.children[0].dataset.tiliaSurfaceRoot).toBe(TILIA_UI_LAYER.panel);
    expect(mapContainer.children[1].dataset.tiliaSurfaceRoot).toBe(TILIA_UI_LAYER.floating);
    expect(panelNode.dataset.tiliaSurface).toBe(TILIA_UI_LAYER.panel);
    expect(panelNode.dataset.tiliaSurfacePriority).toBe(TILIA_CONTROL_PRIORITY.normal);
    expect(floatingNode.dataset.tiliaSurface).toBe(TILIA_UI_LAYER.floating);
    expect(floatingNode.dataset.tiliaSurfacePriority).toBe(TILIA_CONTROL_PRIORITY.high);
  });

  it("reuses an existing surface root and can unmount items", () => {
    const ownerDocument = createDocumentStub();
    const mapContainer = createElement(ownerDocument, "div");
    const manager = createUiSurfaceManager({
      map: {
        getContainer() {
          return mapContainer;
        },
      },
    });

    const firstNode = createElement(ownerDocument, "div");
    const secondNode = createElement(ownerDocument, "div");

    const firstHandle = manager.mount({
      id: "first",
      surface: TILIA_UI_LAYER.floating,
      element: firstNode,
      priority: TILIA_CONTROL_PRIORITY.low,
    });
    manager.mount({
      id: "second",
      surface: TILIA_UI_LAYER.floating,
      element: secondNode,
      priority: TILIA_CONTROL_PRIORITY.high,
    });

    expect(mapContainer.children).toHaveLength(1);
    expect(mapContainer.children[0].children).toHaveLength(2);

    firstHandle.unmount();

    expect(mapContainer.children[0].children).toHaveLength(1);
    expect(mapContainer.children[0].children[0]).toBe(secondNode);
  });

  it("publishes reserved insets for side and bottom panel layouts", () => {
    const ownerDocument = createDocumentStub();
    const mapContainer = createElement(ownerDocument, "div");
    const manager = createUiSurfaceManager({
      map: {
        getContainer() {
          return mapContainer;
        },
      },
    });
    const panelNode = createElement(ownerDocument, "aside");
    panelNode.offsetWidth = 360;
    panelNode.offsetHeight = 280;

    manager.setPanelState({ active: true, layout: "side", element: panelNode });

    expect(mapContainer.dataset.tiliaPanelLayout).toBe("side");
    expect(mapContainer.style.values["--tilia-reserved-right"]).toBe("384px");
    expect(mapContainer.style.values["--tilia-reserved-bottom"]).toBeUndefined();

    manager.setPanelState({ active: true, layout: "bottom", element: panelNode });

    expect(mapContainer.dataset.tiliaPanelLayout).toBe("bottom");
    expect(mapContainer.style.values["--tilia-reserved-bottom"]).toBe("304px");
    expect(mapContainer.style.values["--tilia-reserved-right"]).toBeUndefined();

    manager.setPanelState({ active: false });

    expect(mapContainer.dataset.tiliaPanelLayout).toBeUndefined();
    expect(mapContainer.style.values["--tilia-reserved-right"]).toBeUndefined();
    expect(mapContainer.style.values["--tilia-reserved-bottom"]).toBeUndefined();
  });

  it("lets keep-policy conflicting controls keep the corner and pushes the panel instead", () => {
    const ownerDocument = createDocumentStub();
    const mapContainer = createElement(ownerDocument, "div");
    const topRightCorner = createElement(ownerDocument, "div");
    topRightCorner.className = "leaflet-top leaflet-right";
    topRightCorner.offsetWidth = 52;
    const highPriorityControl = createElement(ownerDocument, "div");
    highPriorityControl.className = "tilia-map-control tilia-base-map-control";
    highPriorityControl.dataset.tiliaPriority = "normal";
    highPriorityControl.dataset.tiliaEdgePolicy = TILIA_CONTROL_EDGE_POLICY.keep;
    topRightCorner.appendChild(highPriorityControl);
    mapContainer.appendChild(topRightCorner);

    const manager = createUiSurfaceManager({
      map: {
        getContainer() {
          return mapContainer;
        },
      },
    });
    const panelNode = createElement(ownerDocument, "aside");
    panelNode.offsetWidth = 360;

    manager.setPanelState({ active: true, layout: "side", element: panelNode });

    expect(mapContainer.style.values["--tilia-panel-offset-right"]).toBe("76px");
    expect(mapContainer.style.values["--tilia-reserved-right"]).toBeUndefined();
  });

  it("lets explicit yield policy override high priority and keep the panel reservation", () => {
    const ownerDocument = createDocumentStub();
    const mapContainer = createElement(ownerDocument, "div");
    const topRightCorner = createElement(ownerDocument, "div");
    topRightCorner.className = "leaflet-top leaflet-right";
    topRightCorner.offsetWidth = 52;
    const highPriorityControl = createElement(ownerDocument, "div");
    highPriorityControl.className = "tilia-map-control tilia-base-map-control";
    highPriorityControl.dataset.tiliaPriority = "high";
    highPriorityControl.dataset.tiliaEdgePolicy = TILIA_CONTROL_EDGE_POLICY.yield;
    topRightCorner.appendChild(highPriorityControl);
    mapContainer.appendChild(topRightCorner);

    const manager = createUiSurfaceManager({
      map: {
        getContainer() {
          return mapContainer;
        },
      },
    });
    const panelNode = createElement(ownerDocument, "aside");
    panelNode.offsetWidth = 360;

    manager.setPanelState({ active: true, layout: "side", element: panelNode });

    expect(mapContainer.style.values["--tilia-reserved-right"]).toBe("384px");
    expect(mapContainer.style.values["--tilia-panel-offset-right"]).toBeUndefined();
  });
});