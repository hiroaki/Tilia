import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testDom = vi.hoisted(() => {
  class FakeElement {
    constructor(tagName = "div", className = "") {
      this.tagName = tagName.toUpperCase();
      this.className = className;
      this.children = [];
      this.dataset = {};
      this.listeners = new Map();
      this.parentNode = null;
      this.textContent = "";
      this.classList = {
        add: (...names) => {
          const classes = new Set(this.className.split(/\s+/).filter(Boolean));
          names.forEach((name) => classes.add(name));
          this.className = [...classes].join(" ");
        },
        remove: (...names) => {
          const removed = new Set(names);
          this.className = this.className
            .split(/\s+/)
            .filter((name) => name && !removed.has(name))
            .join(" ");
        },
      };
    }

    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }

    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }

    remove() {
      if (!this.parentNode) return;
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      this.parentNode = null;
    }

    querySelectorAll(selector) {
      const className = selector.startsWith(".") ? selector.slice(1) : null;
      const matches = [];
      for (const child of this.children) {
        if (className && child.className.split(/\s+/).includes(className)) matches.push(child);
        matches.push(...child.querySelectorAll(selector));
      }
      return matches;
    }
  }

  class MockControl {
    constructor(options = {}) {
      this.options = options;
      this.remove = vi.fn(() => {
        this._container?.remove();
        this._map = null;
        return this;
      });
    }

    addTo(map) {
      this._map = map;
      this._container = this.onAdd();
      map.getContainer().appendChild(this._container);
      return this;
    }
  }

  return { FakeElement, MockControl };
});

vi.mock("leaflet", () => ({
  Control: testDom.MockControl,
  DomUtil: {
    create(tagName, className = "", parent = null) {
      const node = new testDom.FakeElement(tagName, className);
      parent?.appendChild(node);
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

vi.mock("../src/core/boot.js", () => ({
  createTiliaCore: vi.fn(() => ({
    state: {},
    registry: { dispatch: vi.fn() },
    context: {},
    subscribeInteractions: vi.fn(() => () => {}),
  })),
}));

vi.mock("../src/core/state.js", () => ({ setError: vi.fn() }));
vi.mock("../src/ui/styles.js", () => ({
  ensureBuiltinUiStyles: vi.fn(),
  registerStylesheet: vi.fn(),
}));
vi.mock("../src/plugins/input/dropzone.js", () => ({ installDropzonePlugin: vi.fn() }));
vi.mock("../src/plugins/input/file-import.js", () => ({ installFileImportControl: vi.fn() }));
vi.mock("../src/plugins/input/url-import.js", () => ({ installUrlImportControl: vi.fn() }));
vi.mock("../src/plugins/input/query-import.js", () => ({ installQueryImportPlugin: vi.fn() }));
vi.mock("../src/plugins/ui/elevation-panel.js", () => ({ installElevationPanelControl: vi.fn() }));
vi.mock("../src/plugins/ui/base-map-control.js", () => ({ installBaseMapControl: vi.fn() }));
vi.mock("../src/plugins/ui/layers-control.js", () => ({ installLayersControl: vi.fn() }));
vi.mock("../src/plugins/ui/panel.js", () => ({ installPanelPlugin: vi.fn() }));
vi.mock("../src/plugins/ui/settings-panel.js", () => ({ installSettingsPanelControl: vi.fn() }));

import { createTiliaApp } from "../src/app.js";
import { status } from "../src/builtins.js";
import { installStatusControl } from "../src/plugins/ui/status-control.js";

function createMap() {
  const container = new testDom.FakeElement("div", "map");
  return {
    getContainer: () => container,
    container,
  };
}

describe("tilia-status lifecycle", () => {
  const originalDocument = globalThis.document;
  const originalHTMLElement = globalThis.HTMLElement;

  beforeEach(() => {
    globalThis.HTMLElement = testDom.FakeElement;
    globalThis.document = {
      createElement: (tagName) => new testDom.FakeElement(tagName),
    };
  });

  afterEach(() => {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalHTMLElement === undefined) delete globalThis.HTMLElement;
    else globalThis.HTMLElement = originalHTMLElement;
  });

  it("removes its owned Leaflet control when destroyed", () => {
    const map = createMap();
    const api = installStatusControl({ map });

    expect(map.container.querySelectorAll(".tilia-status-control")).toHaveLength(1);
    api.destroy();
    expect(map.container.querySelectorAll(".tilia-status-control")).toHaveLength(0);
  });

  it("does not accumulate controls across uninstall and reinstall cycles", async () => {
    const map = createMap();
    const app = createTiliaApp({
      map,
      builtins: { "tilia-status": status },
    });

    await app.use("tilia-status");
    expect(map.container.querySelectorAll(".tilia-status-control")).toHaveLength(1);

    await app.unuse("tilia-status");
    expect(map.container.querySelectorAll(".tilia-status-control")).toHaveLength(0);
    expect(app.plugins.has("tilia-status")).toBe(false);
    expect(app.services["tilia-status"]).toBeUndefined();
    expect(() => app.setStatus("after uninstall")).not.toThrow();

    await app.use("tilia-status");
    app.setStatus("after reinstall");
    expect(map.container.querySelectorAll(".tilia-status-control")).toHaveLength(1);
    expect(map.container.querySelectorAll(".tilia-status-text")[0].textContent).toBe("after reinstall");

    await app.unuse("tilia-status");
    await app.use("tilia-status");
    expect(map.container.querySelectorAll(".tilia-status-control")).toHaveLength(1);

    await app.unuse("tilia-status");
    expect(map.container.querySelectorAll(".tilia-status-control")).toHaveLength(0);
  });
});
