import { getTrackStylePreset, TRACK_STYLE_PRESETS } from "../map/track-style-presets.js";

export function resolveGpxStyle({ preferences, derived }) {
  const preset = preferences.stylePresetId;
  if (preset === "default") return getTrackStylePreset(derived?.defaultStyleIndex);
  return TRACK_STYLE_PRESETS.find((candidate) => candidate.id === preset) ?? getTrackStylePreset(0);
}
