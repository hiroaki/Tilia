import { describe, expect, it } from "vitest";
import {
  formatPointProperty,
  formatPointPropertyForEdit,
  formatTimestampForInspector,
  parsePointProperty,
} from "../plugins/x-track-editor/form.js";

describe("x-track-editor point inspector formatting", () => {
  it("uses compact display precision without changing edit precision", () => {
    const point = { lat: 35.68123456789, lon: 139.76712345678, elevation: 42.14 };
    expect(formatPointProperty(point, "lat")).toBe("35.68123");
    expect(formatPointProperty(point, "lon")).toBe("139.76712");
    expect(formatPointProperty(point, "elevation")).toBe("42.1");
    expect(formatPointPropertyForEdit(point, "lat")).toBe("35.68123456789");
    expect(point.lat).toBe(35.68123456789);
  });

  it("formats nullable values and compact local time safely", () => {
    expect(formatPointProperty({ elevation: null }, "elevation")).toBe("—");
    expect(formatTimestampForInspector(null)).toBe("—");
    const timestamp = new Date(2025, 0, 2, 14, 32, 8).getTime();
    expect(formatTimestampForInspector(timestamp)).toBe("14:32:08");
    expect(formatPointPropertyForEdit({ timestamp }, "timestamp")).toBe("2025-01-02T14:32:08");
  });

  it("validates and parses one property at a time", () => {
    expect(parsePointProperty("lat", "35.5")).toEqual({ valid: true, value: 35.5 });
    expect(parsePointProperty("lon", "").valid).toBe(false);
    expect(parsePointProperty("elevation", "")).toEqual({ valid: true, value: null });
    expect(parsePointProperty("elevation", "invalid").valid).toBe(false);
  });
});
