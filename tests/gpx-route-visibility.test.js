import { describe, expect, it } from "vitest";
import { createGpxProvider } from "../src/plugins/domains/gpx-provider.js";
import { isGpxTargetVisible } from "../src/gpx/visibility.js";
const data = { routes: [{ points: [] }, { points: [] }], tracks: [{ segments: [] }] };
const provider = createGpxProvider();

describe("GPX route visibility preferences", () => {
  it("defaults to visible, freezes preferences and keeps route and track state independent", async () => {
    const { snapshot } = await provider.prepareCreate({ value: data });
    expect(snapshot.preferences.routeVisibility).toEqual({});
    expect(Object.isFrozen(snapshot.preferences.routeVisibility)).toBe(true);
    expect(isGpxTargetVisible(snapshot, { kind: "route", routeIndex: 0 })).toBe(true);
    const result = await provider.prepareMutation({ currentInstance: snapshot, command: { type: "set-route-visibility", routeIndex: 0, visible: false } });
    expect(result.nextSnapshot.preferences.routeVisibility).toEqual({ 0: false });
    expect(result.nextSnapshot.preferences.trackVisibility).toEqual({});
    expect(isGpxTargetVisible(result.nextSnapshot, { kind: "route", routeIndex: 0 })).toBe(false);
    expect(isGpxTargetVisible(result.nextSnapshot, { kind: "route", routeIndex: 1 })).toBe(true);
    expect(isGpxTargetVisible(result.nextSnapshot, { kind: "track", trackIndex: 0 })).toBe(true);
  });
  it.each([null, [], false, "false", { 0: 0 }, { 0: "false" }, { '-1': false }, { 2: false }, { '0.5': false }, { invalid: false }])("rejects invalid initial route preferences %j", async (routeVisibility) => {
    await expect(provider.prepareCreate({ value: { data, preferences: { routeVisibility } } })).rejects.toMatchObject({ code: "SEMANTIC_INPUT_INVALID" });
  });
  it("retains corresponding indexes on replacement and drops removed ones permanently", async () => {
    const { instance } = await provider.prepareCreate({ value: { data, preferences: { routeVisibility: { 0: false, 1: false }, trackVisibility: { 0: false } } } });
    const replaced = await provider.prepareMutation({ currentInstance: instance, command: { type: "replace-data", data: { routes: [{ name: "new index 0", points: [] }] } } });
    expect(replaced.nextSnapshot.preferences.routeVisibility).toEqual({ 0: false });
    expect(replaced.nextSnapshot.preferences.trackVisibility).toEqual({});
    const expanded = await provider.prepareMutation({ currentInstance: replaced.nextInstance, command: { type: "replace-data", data } });
    expect(expanded.nextSnapshot.preferences.routeVisibility).toEqual({ 0: false });
    expect(isGpxTargetVisible(expanded.nextSnapshot, { kind: "route", routeIndex: 1 })).toBe(true);
  });
  it("document visibility includes only individually visible routes, including empty logical routes", async () => {
    const { instance } = await provider.prepareCreate({ value: { data: { routes: data.routes }, preferences: { routeVisibility: { 0: false, 1: false } } } });
    expect(isGpxTargetVisible(instance, { kind: "document" })).toBe(false);
    const shown = await provider.prepareMutation({ currentInstance: instance, command: { type: "set-route-visibility", routeIndex: 1, visible: true } });
    expect(isGpxTargetVisible(shown.nextSnapshot, { kind: "document" })).toBe(true);
    const hidden = await provider.prepareMutation({ currentInstance: shown.nextInstance, command: { type: "set-category-visibility", category: "routes", visible: false } });
    expect(isGpxTargetVisible(hidden.nextSnapshot, { kind: "document" })).toBe(false);
    expect(hidden.nextSnapshot.preferences.routeVisibility).toEqual({ 0: false, 1: true });
  });
});
