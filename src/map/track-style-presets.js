export const TRACK_STYLE_SHARED = {
  weight: 6,
  opacity: 0.6,
};

export const TRACK_STYLE_PRESETS = [
  {
    id: "cyan",
    color: "#0099cc",
    weight: TRACK_STYLE_SHARED.weight,
    opacity: TRACK_STYLE_SHARED.opacity,
  },
  {
    id: "indigo",
    color: "#5c6bc0",
    weight: TRACK_STYLE_SHARED.weight,
    opacity: TRACK_STYLE_SHARED.opacity,
  },
  {
    id: "magenta",
    color: "#c855bc",
    weight: TRACK_STYLE_SHARED.weight,
    opacity: TRACK_STYLE_SHARED.opacity,
  },
  {
    id: "crimson",
    color: "#d1495b",
    weight: TRACK_STYLE_SHARED.weight,
    opacity: TRACK_STYLE_SHARED.opacity,
  },
  {
    id: "brick",
    color: "#bc6c25",
    weight: TRACK_STYLE_SHARED.weight,
    opacity: TRACK_STYLE_SHARED.opacity,
  },
  {
    id: "amber",
    color: "#f4a261",
    weight: TRACK_STYLE_SHARED.weight,
    opacity: TRACK_STYLE_SHARED.opacity,
  },
  {
    id: "olive",
    color: "#6a994e",
    weight: TRACK_STYLE_SHARED.weight,
    opacity: TRACK_STYLE_SHARED.opacity,
  },
  {
    id: "forest",
    color: "#2a9d8f",
    weight: TRACK_STYLE_SHARED.weight,
    opacity: TRACK_STYLE_SHARED.opacity,
  },
];

export function normalizeTrackStylePresetIndex(index, presetCount = TRACK_STYLE_PRESETS.length) {
  if (!Number.isInteger(index) || presetCount <= 0) {
    return 0;
  }
  return ((index % presetCount) + presetCount) % presetCount;
}

export function getTrackStylePreset(index) {
  return TRACK_STYLE_PRESETS[normalizeTrackStylePresetIndex(index)];
}