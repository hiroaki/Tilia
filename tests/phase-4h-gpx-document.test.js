import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { normalizeGpxDocument, resolveGpxTarget, updateGpxPoint } from "../src/gpx/document.js";
import { parseGpxText, MAX_ROUTES_PER_GPX, MAX_ROUTE_POINTS_PER_ROUTE } from "../src/gpx/parse.js";
import { formatGpxDecimal, serializeGpxSource } from "../src/gpx/serialize.js";
import { createGpxProvider } from "../src/plugins/domains/gpx-provider.js";
const createDomParser = ({ onError } = {}) => new DOMParser({ onError: (_level, message) => onError(message) });
const parse = (xml, options = {}) => parseGpxText(xml, { createDomParser, ...options });
const point = { lat: 0, lon: 180, elevation: 0, timestamp: 0, name: "  A & <B>  ", description: " description ", symbol: " Flag " };

describe("Phase 4H canonical GPX supported subset", () => {
  it("round-trips metadata, every point type, empty structures and normalized supported text", () => {
    const input = { name: "original.gpx", metadata: { name: " Document ", description: "  Summary  ", timestamp: 0 },
      tracks: [{ name: " Track ", description: " Details ", segments: [{ points: [] }, { points: [point] }] }, { segments: [] }],
      routes: [{ name: " Route ", description: " Plan ", points: [point] }, { points: [] }], waypoints: [point], unsupported: "discard" };
    const canonical = normalizeGpxDocument(input);
    const xml = serializeGpxSource(input);
    expect(parse(xml, { fileName: input.name })).toEqual(canonical);
    expect(xml.indexOf("<metadata>")).toBeLessThan(xml.indexOf("<wpt "));
    expect(xml.indexOf("<wpt ")).toBeLessThan(xml.indexOf("<rte>"));
    expect(xml.indexOf("<rte>")).toBeLessThan(xml.indexOf("<trk>"));
    expect(xml.indexOf("<ele>0</ele>")).toBeLessThan(xml.indexOf("<time>1970", xml.indexOf("<wpt ")));
    expect(xml.indexOf("<time>1970", xml.indexOf("<wpt "))).toBeLessThan(xml.indexOf("<name>A &amp; &lt;B&gt;</name>"));
    expect(xml).not.toContain("original.gpx");
    expect(xml).not.toContain("unsupported");
    expect(Object.isFrozen(canonical.tracks[0].segments[1].points[0])).toBe(true);
    expect(input.tracks[0].name).toBe(" Track ");
  });
  it("normalizes absent and blank supported text consistently across programmatic and parsed input", () => {
    const input = { metadata: { name: " " }, tracks: [{ name: " ", segments: [{ points: [{ ...point, name: " ", description: " ", symbol: " " }] }] }], routes: [{ name: "", points: [] }] };
    expect(parse(serializeGpxSource(input))).toEqual(normalizeGpxDocument(input));
  });
  it("omits null fields but preserves zero for all point types", () => {
    const input = { waypoints: [{ lat: 0, lon: 0 }, point] };
    const xml = serializeGpxSource(input);
    expect((xml.match(/<ele>/g) ?? [])).toHaveLength(1);
    expect((xml.match(/<time>/g) ?? [])).toHaveLength(1);
    expect(parse(xml)).toEqual(normalizeGpxDocument(input));
  });
  it.each([1e-7, -1e-7, 1e21, -1.2345678901234568e25, Number.MIN_VALUE, Number.MAX_VALUE])("uses lossless decimal notation for %s", (value) => {
    const text = formatGpxDecimal(value);
    expect(text).not.toMatch(/[eE]/);
    expect(Number(text)).toBe(value);
    const input = { waypoints: [{ lat: 1e-7, lon: -1e-7, elevation: value }] };
    expect(parse(serializeGpxSource(input)).waypoints[0].elevation).toBe(value);
  });
  it.each(["\u0000", "\u000b", "\u000c", "\ud800", "\ufffe"])("rejects invalid XML character %j before trimming it away", (value) => {
    expect(() => serializeGpxSource({ metadata: { name: value } })).toThrow(/metadata.name/);
    expect(() => serializeGpxSource({ waypoints: [{ ...point, symbol: value }] })).toThrow(/waypoints\[0\].symbol/);
    expect(() => serializeGpxSource({}, { creator: value })).toThrow(/creator/);
  });
  it.each([0.5, 8.64e15 + 1, Date.parse("0000-01-01T00:00:00Z"), Date.parse("+010000-01-01T00:00:00Z")])("rejects unrepresentable ISO timestamp %s explicitly", (timestamp) => {
    expect(normalizeGpxDocument({ metadata: { timestamp } }).metadata.timestamp).toBe(timestamp);
    expect(() => serializeGpxSource({ metadata: { timestamp } })).toThrow(/metadata.timestamp.*ISO timestamp/);
    expect(() => serializeGpxSource({ waypoints: [{ ...point, timestamp }] })).toThrow(/waypoints\[0\].timestamp.*ISO timestamp/);
  });
  it("keeps file-import limits while supporting unrestricted programmatic round trips", () => {
    const input = { routes: Array.from({ length: MAX_ROUTES_PER_GPX + 1 }, () => ({ points: [] })) };
    const xml = serializeGpxSource(input);
    expect(() => parse(xml)).toThrow(/Too many GPX routes/);
    expect(parse(xml, { enforceImportLimits: false })).toEqual(normalizeGpxDocument(input));
    const manyPoints = serializeGpxSource({ routes: [{ points: Array.from({ length: MAX_ROUTE_POINTS_PER_ROUTE + 1 }, () => point) }] });
    expect(() => parse(manyPoints)).toThrow(/Too many route points/);
    expect(parse(manyPoints, { enforceImportLimits: false }).routes[0].points).toHaveLength(MAX_ROUTE_POINTS_PER_ROUTE + 1);
  });
  it.each([{ kind: "__proto__" }, { kind: "constructor" }, { kind: "waypoint", waypointIndex: -1 },
    { kind: "waypoint", waypointIndex: 0, revision: 0 }, { kind: "document", extra: true }, null, []])("rejects invalid targets %j as semantic input errors", (target) => {
    expect(() => resolveGpxTarget(normalizeGpxDocument({ waypoints: [point] }), target))
      .toThrowError(expect.objectContaining({ code: "SEMANTIC_INPUT_INVALID" }));
  });
  it("updates an existing point without changing hierarchy and distinguishes omitted, null and zero", () => {
    const original = normalizeGpxDocument({ tracks: [{ segments: [{ points: [point] }, { points: [] }] }], routes: [{ points: [point] }], waypoints: [point] });
    for (const target of [{ kind: "track-point", trackIndex: 0, segmentIndex: 0, pointIndex: 0 }, { kind: "route-point", routeIndex: 0, pointIndex: 0 }, { kind: "waypoint", waypointIndex: 0 }]) {
      const updated = updateGpxPoint(original, { target, patch: { elevation: null, timestamp: 0 } });
      expect(updated.tracks).toHaveLength(1);
      expect(updated.tracks[0].segments).toHaveLength(2);
      expect(updated.routes).toHaveLength(1);
      expect(updated.waypoints).toHaveLength(1);
      expect(original.waypoints[0].elevation).toBe(0);
      expect(() => updateGpxPoint(original, { target, patch: { timestamp: undefined } })).toThrow(/undefined/);
      expect(() => updateGpxPoint(original, { target, patch: { name: "new" } })).toThrow(/Unsupported/);
    }
  });
  it("validates no-op point updates, stale refs, and visibility pruning on replacement", async () => {
    const provider = createGpxProvider();
    const { instance } = await provider.prepareCreate({ value: { data: { waypoints: [point], tracks: [{ segments: [] }, { segments: [] }] }, preferences: { trackVisibility: { 1: false } } } });
    const target = { kind: "waypoint", waypointIndex: 0, revision: 1 };
    expect(await provider.prepareMutation({ currentInstance: instance, expectedRevision: 1, command: { type: "update-point", target, patch: { elevation: 0 } } })).toEqual({ changed: false });
    await expect(provider.prepareMutation({ currentInstance: instance, expectedRevision: 2, command: { type: "update-point", target, patch: {} } })).rejects.toMatchObject({ code: "ENTRY_STALE_REVISION" });
    await expect(provider.prepareMutation({ currentInstance: instance, expectedRevision: 1, command: { type: "update-point", target: { kind: "waypoint", waypointIndex: 1 }, patch: {} } })).rejects.toMatchObject({ code: "SEMANTIC_INPUT_INVALID" });
    const replacement = await provider.prepareMutation({ currentInstance: instance, command: { type: "replace-data", data: { tracks: [{ segments: [] }] } } });
    expect(replacement.nextSnapshot.preferences.trackVisibility).toEqual({});
  });
});
