import { describe, expect, it } from "vitest";

import {
  createImportedRouteSource,
  createPhloemHeaders,
  createPhloemRequestBody,
  normalizeRouteResponse,
} from "../plugins/x-route-search/helpers.js";

describe("x-route-search helpers", () => {
  it("normalizes a single route response and converts coordinate order", () => {
    const routes = normalizeRouteResponse({
      route: {
        geometry: {
          type: "LineString",
          coordinates: [[139.76, 35.68], [139.77, 35.69]],
        },
        distance_meters: 1234.5,
        duration_seconds: 456.7,
        provider: "graphhopper",
        warnings: [],
      },
    });

    expect(routes).toEqual([
      expect.objectContaining({
        provider: "graphhopper",
        distanceMeters: 1234.5,
        durationSeconds: 456.7,
        geometry: {
          type: "LineString",
          coordinates: [
            { lat: 35.68, lon: 139.76 },
            { lat: 35.69, lon: 139.77 },
          ],
        },
      }),
    ]);
  });

  it("limits normalized routes to the requested maximum", () => {
    const routes = normalizeRouteResponse({
      routes: [
        { geometry: { type: "LineString", coordinates: [[1, 2], [3, 4]] } },
        { geometry: { type: "LineString", coordinates: [[5, 6], [7, 8]] } },
        { geometry: { type: "LineString", coordinates: [[9, 10], [11, 12]] } },
      ],
    }, 2);

    expect(routes).toHaveLength(2);
  });

  it("returns no routes when maxRoutes is zero", () => {
    const routes = normalizeRouteResponse({
      routes: [
        { geometry: { type: "LineString", coordinates: [[1, 2], [3, 4]] } },
      ],
    }, 0);

    expect(routes).toEqual([]);
  });

  it("builds an imported route source compatible with GPX entry paths", () => {
    const source = createImportedRouteSource({
      geometry: {
        type: "LineString",
        coordinates: [[139.7596, 35.665521], [139.765893, 35.671989]],
      },
      distance_meters: 971.364,
      duration_seconds: 74.15,
      provider: "graphhopper",
      warnings: [],
    }, {
      profile: "car",
      waypoints: [
        { lat: 35.665521, lon: 139.7596 },
        { lat: 35.668, lon: 139.762 },
        { lat: 35.671989, lon: 139.765893 },
      ],
    });

    expect(source).toMatchObject({
      type: "gpx",
      name: "Route (car-971m-1min).gpx",
      waypoints: [
        { lat: 35.665521, lon: 139.7596, name: "Start" },
        { lat: 35.668, lon: 139.762, name: "Via 1" },
        { lat: 35.671989, lon: 139.765893, name: "Goal" },
      ],
      tracks: [expect.objectContaining({
        segments: [{
          points: [
            { lat: 35.665521, lon: 139.7596, elevation: null, timestamp: null },
            { lat: 35.671989, lon: 139.765893, elevation: null, timestamp: null },
          ],
        }],
      })],
      routeSummary: {
        provider: "graphhopper",
        distanceMeters: 971.364,
        durationSeconds: 74.15,
        warnings: [],
      },
    });
    expect(source.tracks[0].name).toBeUndefined();
    expect(source).not.toHaveProperty("trackPointDetails");
  });

  it("ignores blank and out-of-range waypoint inputs", () => {
    const source = createImportedRouteSource({
      geometry: {
        type: "LineString",
        coordinates: [[139.7596, 35.665521], [139.765893, 35.671989]],
      },
      distance_meters: 1000,
      duration_seconds: 120,
      provider: "graphhopper",
      warnings: [],
    }, {
      profile: "car",
      waypoints: [
        { lat: "", lon: "" },
        { lat: "  ", lon: "139.76" },
        { lat: 91, lon: 139.76 },
        { lat: 35.66, lon: 181 },
        { lat: 35.665521, lon: 139.7596 },
      ],
    });

    expect(source.waypoints).toEqual([
      { lat: 35.665521, lon: 139.7596, name: "Goal" },
    ]);
  });

  it("builds a Phloem request body and auth headers", () => {
    expect(createPhloemRequestBody({
      profile: "car",
      points: [
        { lat: "35.68", lon: "139.76" },
        { lat: 35.69, lon: 139.77 },
      ],
    })).toEqual({
      profile: "car",
      points: [
        { lat: 35.68, lon: 139.76 },
        { lat: 35.69, lon: 139.77 },
      ],
      options: {},
    });

    expect(createPhloemHeaders({ apiKey: "secret" })).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer secret",
    });
  });

  it.each(["bike", "foot"])("includes %s in imported route names", (profile) => {
    const source = createImportedRouteSource({
      geometry: {
        type: "LineString",
        coordinates: [[139.7596, 35.665521], [139.765893, 35.671989]],
      },
      distance_meters: 971.364,
      duration_seconds: 74.15,
      provider: "graphhopper",
      warnings: [],
    }, {
      profile,
      waypoints: [
        { lat: 35.665521, lon: 139.7596 },
        { lat: 35.671989, lon: 139.765893 },
      ],
    });

    expect(source?.name).toContain(`(${profile}-`);
  });

  it.each(["bike", "foot"])("keeps %s in request body", (profile) => {
    expect(createPhloemRequestBody({
      profile,
      points: [
        { lat: "35.68", lon: "139.76" },
        { lat: 35.69, lon: 139.77 },
      ],
    })).toMatchObject({
      profile,
    });
  });

  it("normalizes known profile identifiers to lowercase in request body", () => {
    expect(createPhloemRequestBody({
      profile: "Foot",
      points: [
        { lat: "35.68", lon: "139.76" },
        { lat: 35.69, lon: 139.77 },
      ],
    })).toMatchObject({
      profile: "foot",
    });
  });

  it("throws when route profile is unknown", () => {
    expect(() => createPhloemRequestBody({
      profile: "horse",
      points: [
        { lat: "35.68", lon: "139.76" },
        { lat: 35.69, lon: 139.77 },
      ],
    })).toThrow(/invalid route profile/i);
  });

  it("throws when route points include invalid coordinates", () => {
    expect(() => createPhloemRequestBody({
      profile: "car",
      points: [
        { lat: "", lon: "139.76" },
      ],
    })).toThrow(/invalid route point/i);
  });

  it("throws when route points input is not an array", () => {
    expect(() => createPhloemRequestBody({
      profile: "car",
      points: null,
    })).toThrow(/must be an array/i);
  });
});