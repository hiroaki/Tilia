import { describe, expect, it } from "vitest";
import { TILIA_CONTROL_PRIORITY, TILIA_UI_LAYER } from "../src/ui/protocol.js";
import { createUiSurfaceManager } from "../src/ui/surfaces.js";

function createElement(ownerDocument, tagName) {
  return {
    ownerDocument,
    tagName,
    nodeType: 1,
    className: "",
    dataset: {},
    children: [],
    parentNode: null,
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    remove() {
      if (!this.parentNode) {
        return;
      }
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      this.parentNode = null;
    },
  };
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
});