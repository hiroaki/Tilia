import { describe, expect, it } from "vitest";

import {
  TRACK_STYLE_PRESETS,
  TRACK_STYLE_SHARED,
  getTrackStylePreset,
} from "../src/map/track-style-presets.js";

describe("track style presets", () => {
  it("orders presets in a blue-first spectrum sequence", () => {
    expect(TRACK_STYLE_PRESETS.map((preset) => preset.id)).toEqual([
      "cyan",
      "indigo",
      "magenta",
      "crimson",
      "brick",
      "amber",
      "olive",
      "forest",
    ]);
  });

  it("keeps shared weight and opacity on each preset entry", () => {
    for (const preset of TRACK_STYLE_PRESETS) {
      expect(preset.weight).toBe(TRACK_STYLE_SHARED.weight);
      expect(preset.opacity).toBe(TRACK_STYLE_SHARED.opacity);
    }
    expect(getTrackStylePreset(TRACK_STYLE_PRESETS.length)).toEqual(TRACK_STYLE_PRESETS[0]);
  });
});