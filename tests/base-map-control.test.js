import { afterEach, describe, expect, it, vi } from "vitest";

let lastCreatedSelect = null;
const originalDocument = globalThis.document;

function createFakeElement(tagName) {
  return {
    tagName,
    className: "",
    children: [],
    disabled: false,
    title: "",
    value: "",
    textContent: "",
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    replaceChildren(...children) {
      this.children = [...children];
    },
    setAttribute: vi.fn(),
    addEventListener: vi.fn(),
  };
}

vi.mock("../src/map/controls.js", () => ({
  createPanel: vi.fn((className = "") => {
    const panel = createFakeElement("div");
    panel.className = className;
    return panel;
  }),
  createSelect: vi.fn((options = [], className = "") => {
    const select = createFakeElement("select");
    select.className = className;
    for (const option of options) {
      const node = createFakeElement("option");
      node.value = option.value;
      node.textContent = option.label;
      node.selected = option.selected === true;
      select.appendChild(node);
    }
    lastCreatedSelect = select;
    return select;
  }),
  installMapControl: vi.fn(({ createContent }) => {
    createContent();
    return { remove: vi.fn() };
  }),
}));

import { installBaseMapControl } from "../src/plugins/ui/base-map-control.js";

describe("base-map control", () => {
  afterEach(() => {
    lastCreatedSelect = null;
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }
  });

  it("keeps the selector enabled when the current base layer is hidden but a visible alternative exists", () => {
    const baseMaps = {
      getCurrent() {
        return {
          id: "hidden-current",
          label: "Hidden Current",
          provider: "vendor",
        };
      },
      listVisible() {
        return [{
          id: "visible-alt",
          label: "Visible Alternative",
          provider: "vendor",
        }];
      },
      select: vi.fn(),
    };

    globalThis.document = {
      createElement(tagName) {
        return createFakeElement(tagName);
      },
    };

    const api = installBaseMapControl({ map: {}, baseMaps });
    api.render();

    expect(lastCreatedSelect.disabled).toBe(false);
    expect(lastCreatedSelect.children[0]).toEqual(expect.objectContaining({
      value: "__current__:hidden-current",
      textContent: "Hidden Current (current)",
      selected: true,
      disabled: true,
    }));
    expect(lastCreatedSelect.children[1]).toEqual(expect.objectContaining({
      value: "visible-alt",
      textContent: "Visible Alternative",
    }));
  });

  it("shows a placeholder and keeps the selector enabled when no current base layer is active", () => {
    const baseMaps = {
      getCurrent() {
        return null;
      },
      listVisible() {
        return [{
          id: "visible-alt",
          label: "Visible Alternative",
          provider: "vendor",
        }];
      },
      select: vi.fn(),
    };

    globalThis.document = {
      createElement(tagName) {
        return createFakeElement(tagName);
      },
    };

    const api = installBaseMapControl({ map: {}, baseMaps });
    api.render();

    expect(lastCreatedSelect.disabled).toBe(false);
    expect(lastCreatedSelect.children[0]).toEqual(expect.objectContaining({
      value: "__placeholder__",
      textContent: "Select a base map",
      selected: true,
      disabled: true,
    }));
    expect(lastCreatedSelect.children[1]).toEqual(expect.objectContaining({
      value: "visible-alt",
      textContent: "Visible Alternative",
    }));
  });

  it("disables the selector when there is no selectable alternative", () => {
    const baseMaps = {
      getCurrent() {
        return {
          id: "osm",
          label: "OpenStreetMap",
          provider: "osm",
        };
      },
      listVisible() {
        return [{
          id: "osm",
          label: "OpenStreetMap",
          provider: "osm",
        }];
      },
      select: vi.fn(),
    };

    globalThis.document = {
      createElement(tagName) {
        return createFakeElement(tagName);
      },
    };

    const api = installBaseMapControl({ map: {}, baseMaps });
    api.render();

    expect(lastCreatedSelect.disabled).toBe(true);
  });
});