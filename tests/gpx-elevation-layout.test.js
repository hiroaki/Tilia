import { describe, expect, it } from "vitest";
import { elevationLayout, nearestElevationSample } from "../src/gpx/elevation-layout.js";

const track = (samples, trackIndex = 0) => ({
  target: { kind: "track", trackIndex }, samples,
});
const sample = (elevation, distanceMeters = 0) => ({
  elevation, distanceMeters, edgeKind: "recorded",
});

describe("elevation extrema", () => {
  it("handles 200,000 samples without exceeding the function argument limit", () => {
    const samples = Array.from({ length: 200_000 }, (_, index) => sample(index - 100_000, index));
    const layout = elevationLayout([track(samples)]);
    expect(layout.minimum).toBe(-100_000);
    expect(layout.maximum).toBe(99_999);
    expect(layout.points).toHaveLength(samples.length);
    expect(layout.ascent).toBe(199_999);
  });

  it("ignores missing/nonfinite elevations and non-track profiles across tracks", () => {
    const layout = elevationLayout([
      track([sample(null), sample(NaN), sample(Infinity), sample(-Infinity)]),
      track([sample(-12), sample(0)], 1),
      track([sample(45)], 2),
      { target: { kind: "route" }, samples: [sample(-999)] },
    ]);
    expect(layout.minimum).toBe(-12);
    expect(layout.maximum).toBe(45);
    expect(layout.points).toHaveLength(3);
    expect(elevationLayout([])).toMatchObject({ minimum: null, maximum: null });
    expect(elevationLayout([track([sample(null)])])).toMatchObject({ minimum: null, maximum: null });
    const constant = elevationLayout([track([sample(0), sample(0)])]);
    expect(constant).toMatchObject({ minimum: 0, maximum: 0 });
    expect(constant.points.every(({ y }) => y === constant.height / 2)).toBe(true);
  });
});

describe("elevation layout across presentation modes", () => {
  it("keeps all chart coordinates and track spans while excluding inferred distance from Segment totals", () => {
    const profiles = [
      track([
        sample(10, 0), sample(20, 50),
        { ...sample(35, 250), edgeKind: "inferred-gap" },
        sample(null, 275), sample(60, 300),
      ]),
      track([sample(500, 0), sample(505, 100)], 1),
    ];
    const trackMode = elevationLayout(profiles, { mode: "track" });
    const segmentMode = elevationLayout(profiles, { mode: "segment" });
    const xy = ({ x, y }) => [x, y];
    const lines = layout => layout.strokes.filter(s => !s.inferred).map(s => [xy(s.from), xy(s.to)]);
    expect(segmentMode.points.map(xy)).toEqual(trackMode.points.map(xy));
    expect(segmentMode.spans).toEqual(trackMode.spans);
    expect(lines(segmentMode)).toEqual(lines(trackMode));
    expect(trackMode.strokes.filter(s => s.inferred)).toHaveLength(1);
    expect(segmentMode.strokes).toHaveLength(2);
    expect(trackMode).toMatchObject({ distanceMeters: 400, ascent: 15 });
    expect(segmentMode).toMatchObject({ distanceMeters: 200, ascent: 15 });
    expect(segmentMode.points.map(p => p.distanceMeters)).toEqual([0, 50, 50, 100, 0, 100]);
    const [, left, right, last, nextTrack] = segmentMode.points;
    expect(right.x).toBeGreaterThan(left.x);
    expect(nextTrack.x - last.x).toBeCloseTo(4);
    expect(nearestElevationSample(segmentMode, left.x + (right.x - left.x) / 4)).toBe(left);
    expect(nearestElevationSample(segmentMode, right.x - (right.x - left.x) / 4)).toBe(right);
  });

  it("retains traversal order and the first pointer match at coincident points", () => {
    const profiles = [track([sample(10), { ...sample(20), edgeKind: "inferred-gap" }, sample(20)])];
    for (const mode of ["track", "segment"]) {
      const layout = elevationLayout(profiles, { mode });
      const [first, second, third] = layout.points;
      expect(first.x).toBe(second.x);
      expect(second.x).toBe(third.x);
      expect(first.y).not.toBe(second.y);
      expect(second.y).toBe(third.y);
      expect(nearestElevationSample(layout, second.x)).toBe(first);
      expect(layout.distanceMeters).toBe(0);
      expect(layout.ascent).toBe(0);
    }
  });
});
