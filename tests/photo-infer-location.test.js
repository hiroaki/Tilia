import { describe, expect, it } from "vitest";
import { inferPhotoLocationFromGpx } from "../src/photo/infer-location.js";

function source(...tracks) {
  return { type: "gpx", tracks: tracks.map((segments) => ({ segments: segments.map((points) => ({ points })) })) };
}

const at = (timestamp, lat, lon) => ({ timestamp, lat, lon, elevation: null });

const infer = (sources, timestamp) => inferPhotoLocationFromGpx(sources,
  { dateTimeOriginal: new Date(timestamp) }, { timeInterpretationMode: "local" });

describe("inferPhotoLocationFromGpx", () => {
  it("interpolates across consecutive segments in the same track", () => {
    const sources = [source([[at(0, 35, 135)], [at(600_000, 35.1, 135.2)]])];
    const result = inferPhotoLocationFromGpx(sources, { name: "photo.jpg", dateTimeOriginal: new Date(300_000) });
    expect(result.lat).toBeCloseTo(35.05, 6);
    expect(result.lon).toBeCloseTo(135.1, 6);
    expect(result.timeInterpretationMode).toBe("local");
  });

  it.each([
    [source([[at(0, 35, 135)]], [[at(600_000, 35.1, 135.1)]])],
    [source([[at(600_000, 35.1, 135.1)]]), source([[at(0, 35, 135)]])],
    [source([[at(0, 35, 135), at(null, 0, 0)], [at(600_000, 35.1, 135.1)]])],
    [source([[at(0, 35, 135)], [at(8.64e15 + 1, 0, 0), at(600_000, 35.1, 135.1)]])],
    [source([[at(0, 35, 135)], [], [at(600_000, 35.1, 135.1)]])],
  ].map(sources => [sources]))("rejects evidence without an eligible bracket (%j)", sources => {
    expect(() => infer(sources, 300_000)).toThrow("outside GPX timeline range");
  });

  it("uses the first valid point or edge in source and traversal order", () => {
    const descending = source([[at(1000, 10, 10), at(null, 30, 30), at(0, 0, 0), at(0, 8, 8), at(1000, 9, 9)]]);
    const other = source([[at(0, 20, 20), at(1000, 22, 22)]]);
    expect(infer([descending, other], 500).lat).toBe(5);
    expect(infer([other, descending], 500).lat).toBe(21);
    expect(infer([descending], 0).lat).toBe(0);
    expect(infer([descending], 1000).lat).toBe(10);
    expect(infer([source([[at(500, 42, 0)]])], 500).lat).toBe(42);
    expect(infer([source([[at(0, 0, 0), at(null, 42, 0), at(1000, 10, 0)]])], 500).lat).toBe(5);
  });

  it("bridges a long interruption using the actual segment endpoints", () => {
    const day = 86_400_000;
    expect(infer([source([[at(0, 0, 0), at(day, 10, 20)], [at(5 * day, 30, 60), at(6 * day, 40, 80)]])], 2 * day))
      .toMatchObject({ lat: 15, lon: 30 });
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