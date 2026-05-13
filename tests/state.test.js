import { describe, expect, it, vi } from "vitest";

import {
  addEntry,
  clearEntries,
  clearLayers,
  clearSources,
  createAppState,
  removeEntry,
  replaceEntryPresentation,
  replaceEntrySource,
  setError,
} from "../src/core/state.js";

function addSampleEntry(state, overrides = {}) {
  return addEntry(state, {
    kind: "gpx",
    source: { name: "track.gpx" },
    layer: { id: `layer-${state.nextEntryId}` },
    interactions: { id: `interaction-${state.nextEntryId}` },
    visible: true,
    ...overrides,
  });
}

describe("state helpers", () => {
  it("adds entries with incrementing ids and keeps sources and layers aligned", () => {
    const state = createAppState();

    const first = addSampleEntry(state);
    const second = addSampleEntry(state, {
      source: { name: "photo.jpg" },
      layer: { id: "layer-photo" },
    });

    expect(first.id).toBe(1);
    expect(second.id).toBe(2);
    expect(state.entries.map((entry) => entry.id)).toEqual([1, 2]);
    expect(state.sources).toEqual([first.source, second.source]);
    expect(state.layers).toEqual([first.layer, second.layer]);
  });

  it("removes an entry and keeps mirrored sources and layers in sync", () => {
    const state = createAppState();
    addSampleEntry(state, { source: { name: "first.gpx" }, layer: { id: "layer-1" } });
    const second = addSampleEntry(state, { source: { name: "second.gpx" }, layer: { id: "layer-2" } });
    addSampleEntry(state, { source: { name: "third.gpx" }, layer: { id: "layer-3" } });

    const removed = removeEntry(state, second.id);

    expect(removed).toMatchObject({ id: second.id, source: { name: "second.gpx" } });
    expect(state.entries.map((entry) => entry.id)).toEqual([1, 3]);
    expect(state.sources).toEqual([{ name: "first.gpx" }, { name: "third.gpx" }]);
    expect(state.layers).toEqual([{ id: "layer-1" }, { id: "layer-3" }]);
    expect(removeEntry(state, 999)).toBeNull();
  });

  it("replaces presentation and source for an existing entry", () => {
    const state = createAppState();
    const entry = addSampleEntry(state, {
      source: { name: "before.gpx" },
      layer: { id: "layer-before" },
      interactions: { id: "interactions-before" },
    });

    const updatedPresentation = replaceEntryPresentation(state, entry.id, {
      layer: { id: "layer-after" },
      interactions: { id: "interactions-after" },
      visible: false,
    });
    const updatedSource = replaceEntrySource(state, entry.id, { name: "after.gpx" });

    expect(updatedPresentation).toBe(entry);
    expect(updatedSource).toBe(entry);
    expect(entry.layer).toEqual({ id: "layer-after" });
    expect(entry.interactions).toEqual({ id: "interactions-after" });
    expect(entry.visible).toBe(false);
    expect(entry.source).toEqual({ name: "after.gpx" });
    expect(state.layers).toEqual([{ id: "layer-after" }]);
    expect(state.sources).toEqual([{ name: "after.gpx" }]);
    expect(replaceEntryPresentation(state, 999, { visible: true })).toBeNull();
    expect(replaceEntrySource(state, 999, { name: "missing.gpx" })).toBeNull();
  });

  it("clears mirrored collections and records the latest error", () => {
    const state = createAppState();
    addSampleEntry(state, { layer: { id: "layer-1" } });
    addSampleEntry(state, { layer: { id: "layer-2" } });
    const teardown = vi.fn();
    const error = new Error("bad input");

    clearLayers(state, teardown);
    clearSources(state);
    clearEntries(state);
    setError(state, error);

    expect(teardown).toHaveBeenCalledTimes(2);
    expect(teardown).toHaveBeenNthCalledWith(1, { id: "layer-1" });
    expect(teardown).toHaveBeenNthCalledWith(2, { id: "layer-2" });
    expect(state.layers).toEqual([]);
    expect(state.sources).toEqual([]);
    expect(state.entries).toEqual([]);
    expect(state.lastError).toBe(error);
  });
});