import { describe, expect, it } from "vitest";
import { elevationLayout } from "../src/gpx/elevation-layout.js";

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
