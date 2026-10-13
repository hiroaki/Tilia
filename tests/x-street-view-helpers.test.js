import { describe, expect, it } from "vitest";
import { normalizeCoordinate, normalizeHeading, effectiveViewingHeading, createStreetViewUrl, streetViewButtonOffset } from "../plugins/x-street-view/helpers.js";

describe("Street View URL inputs", () => {
  it("copies valid coordinates and wraps world copies", () => {
    const input = { lat: 35, lng: 540 };
    const point = normalizeCoordinate(input);
    expect(point).toEqual({ lat: 35, lng: -180 });
    expect(Object.isFrozen(point)).toBe(true);
    expect(input.lng).toBe(540);
    expect(normalizeCoordinate({ lat: -90, lng: -541 })).toEqual({ lat: -90, lng: 179 });
    expect(normalizeCoordinate({ lat: 90, lng: 1e308 }).lng).toBeGreaterThanOrEqual(-180);
  });
  it.each([null, {}, { lat: "35", lng: 135 }, { lat: 91, lng: 135 },
    { lat: -91, lng: 135 }, { lat: NaN, lng: 135 }, { lat: 35, lng: Infinity }])("rejects invalid coordinate %j", point => {
    expect(normalizeCoordinate(point)).toBeNull();
    expect(() => createStreetViewUrl(point, 90)).toThrow(TypeError);
  });
  it("normalizes finite headings and rejects unavailable values", () => {
    expect([-90, 0, 360, 450, -720].map(normalizeHeading)).toEqual([270, 0, 0, 90, 0]);
    for (const input of [null, undefined, NaN, Infinity, "90"]) expect(normalizeHeading(input)).toBeNull();
  });
  it("distinguishes unavailable tracker values from effective north and preserves valid headings", () => {
    for (const value of [null, undefined, NaN, Infinity]) {
      expect(normalizeHeading(value)).toBeNull();
      expect(effectiveViewingHeading(value)).toBe(0);
      expect(new URL(createStreetViewUrl({ lat: 0, lng: 0 }, value)).searchParams.get("heading")).toBe("0");
    }
    for (const value of [0, 90, 180, 270]) {
      expect(normalizeHeading(value)).toBe(value);
      expect(effectiveViewingHeading(value)).toBe(value);
    }
  });
  it("encodes the official URL without optional camera parameters", () => {
    const url = new URL(createStreetViewUrl({ lat: 35.5, lng: 495 }, -90));
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/@");
    expect(Object.fromEntries(url.searchParams)).toEqual({ api: "1", map_action: "pano", viewpoint: "35.5,135", heading: "270" });
    expect(url.href).toContain("35.5%2C135");
    expect(new URL(createStreetViewUrl({ lat: 0, lng: 0 }, null)).searchParams.get("heading")).toBe("0");
  });
});

describe("Street View button clearance", () => {
  it.each([0, 45, 90, 135, 180, 225, 270, 315, 359.9])("keeps the measured panel beyond the tip at %s degrees", heading => {
    for (const [width, height] of [[100, 44], [240, 70], [20, 100]]) {
      const center = streetViewButtonOffset(heading, width, height);
      const radians = heading * Math.PI / 180;
      const tip = { x: 52 * Math.sin(radians), y: -52 * Math.cos(radians) };
      const dx = Math.max(Math.abs(tip.x - center.x) - width / 2, 0);
      const dy = Math.max(Math.abs(tip.y - center.y) - height / 2, 0);
      expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(8 - 1e-8);
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(8 * Math.SQRT2 + 1e-8);
      expect(center.x * Math.sin(radians) - center.y * Math.cos(radians)).toBeGreaterThan(52);
    }
  });
  it("uses the north arrow tip when tracker heading is unavailable", () => {
    expect(streetViewButtonOffset(null, 100, 44)).toEqual({ x: 0, y: -82 });
  });
});
