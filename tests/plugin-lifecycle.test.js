import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/core/boot.js", () => ({
  createTiliaCore: vi.fn(() => ({
    state: {},
    registry: {
      dispatch: vi.fn(),
    },
    context: {},
    subscribeInteractions: vi.fn(() => () => {}),
  })),
}));

vi.mock("../src/core/state.js", () => ({
  setError: vi.fn(),
}));

vi.mock("../src/builtins.js", () => ({
  builtins: {},
}));

vi.mock("../src/map/base.js", () => ({
  createBaseMap: vi.fn(() => ({
    map: {},
    tileLayer: null,
  })),
}));

vi.mock("../src/map/controls.js", () => ({
  createButton: vi.fn(),
  createPanel: vi.fn(),
  createSelect: vi.fn(),
  installMapControl: vi.fn(),
}));

import { createTiliaApp } from "../src/app.js";

describe("createTiliaApp plugin lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("installs each plugin only once and reuses its API", async () => {
    const setup = vi.fn(async (app, options) => ({
      enabled: true,
      mode: options.mode,
      map: app.getMap(),
    }));
    const plugin = {
      id: "vendor-plugin",
      setup,
    };
    const map = { name: "map-stub" };
    const app = createTiliaApp({ map, builtins: {} });

    const firstApi = await app.use(plugin, { mode: "initial" });
    const secondApi = await app.use(plugin, { mode: "ignored" });

    expect(setup).toHaveBeenCalledTimes(1);
    expect(firstApi).toBe(secondApi);
    expect(firstApi).toEqual({
      enabled: true,
      mode: "initial",
      map,
    });
    expect(app.services[plugin.id]).toBe(firstApi);
  });

  it("rejects plugins whose required dependency is not installed", async () => {
    const setup = vi.fn();
    const plugin = {
      id: "vendor-dependent",
      requires: ["vendor-base"],
      setup,
    };
    const app = createTiliaApp({ map: {}, builtins: {} });

    await expect(app.use(plugin)).rejects.toThrow('Plugin "vendor-dependent" requires "vendor-base"');
    expect(setup).not.toHaveBeenCalled();
  });

  it("runs teardown and removes the provided service on unuse", async () => {
    const destroy = vi.fn(async () => {});
    const plugin = {
      id: "vendor-teardown",
      setup: vi.fn(() => destroy),
    };
    const app = createTiliaApp({ map: {}, builtins: {} });

    const api = await app.use(plugin);
    const removedApi = await app.unuse(plugin.id);

    expect(api).toEqual({ destroy });
    expect(removedApi).toBe(api);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(app.services[plugin.id]).toBeUndefined();
    expect(app.plugins.has(plugin.id)).toBe(false);
  });
});