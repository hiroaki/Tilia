import { describe, expect, it } from "vitest";
import { inferPhotoLocationFromGpx } from "../src/photo/infer-location.js";

function source(...tracks) {
  return { type: "gpx", tracks: tracks.map((segments) => ({ segments: segments.map((points) => ({ points })) })) };
}

const at = (timestamp, lat, lon) => ({ timestamp, lat, lon, elevation: null });

describe("inferPhotoLocationFromGpx", () => {
  it("interpolates from canonical points across segment and track boundaries", () => {
    const sources = [source([[at(0, 35, 135)]], [[at(600_000, 35.1, 135.2)]])];
    const result = inferPhotoLocationFromGpx(sources, { name: "photo.jpg", dateTimeOriginal: new Date(300_000) });
    expect(result.lat).toBeCloseTo(35.05, 6);
    expect(result.lon).toBeCloseTo(135.1, 6);
    expect(result.timeInterpretationMode).toBe("local");
  });

  it("searches timestamp candidates across GPX sources in chronological order", () => {
    const result = inferPhotoLocationFromGpx([source([[at(600_000, 35.1, 135.1)]]), source([[at(0, 35, 135)]])], { name: "photo.jpg", dateTimeOriginal: new Date(300_000) });
    expect(result.lat).toBeCloseTo(35.05, 6);
    expect(result.lon).toBeCloseTo(135.05, 6);
  });

  it("throws for timestamps outside valid canonical GPX data", () => {
    expect(() => inferPhotoLocationFromGpx([source([[at(0, 35, 135), at(600_000, 35.1, 135.2)]])], { name: "photo.jpg", dateTimeOriginal: new Date(900_000) })).toThrow("outside GPX timeline range");
  });

  it("supports explicit and auto time interpretation", () => {
    const timestamp = Date.UTC(2024, 0, 1, 3, 0, 0);
    const photo = { name: "photo.jpg", dateTimeOriginal: new Date(timestamp) };
    const sources = [source([[at(timestamp - 60_000, 35, 135), at(timestamp + 60_000, 35.2, 135.2)]])];
    expect(inferPhotoLocationFromGpx(sources, photo, { timeInterpretationMode: "local" }).lat).toBeCloseTo(35.1, 6);
    expect(inferPhotoLocationFromGpx(sources, photo, { timeInterpretationMode: "auto" }).timeInterpretationMode).toBe("local");
  });
});