export const presetPhotoTimeModes = ["auto", "local", "utc"];

export function parseFixedOffsetMinutes(mode) {
  if (typeof mode !== "string") {
    return null;
  }

  const trimmed = mode.trim();
  if (trimmed === "Z") {
    return 0;
  }

  const match = /^([+-])(\d{2}):(\d{2})$|^([+-])(\d{2})(\d{2})$/.exec(trimmed);
  if (!match) {
    return null;
  }

  const sign = match[1] || match[4];
  const hours = Number(match[2] || match[5]);
  const minutes = Number(match[3] || match[6]);
  if (hours > 23 || minutes > 59) {
    throw new Error(`Invalid photo time mode: ${mode}`);
  }

  const totalMinutes = (hours * 60) + minutes;
  return sign === "+" ? totalMinutes : -totalMinutes;
}

export function normalizePhotoTimeMode(mode) {
  if (typeof mode !== "string") {
    return null;
  }

  const trimmed = mode.trim();
  if (presetPhotoTimeModes.includes(trimmed)) {
    return trimmed;
  }

  const offsetMinutes = parseFixedOffsetMinutes(trimmed);
  if (offsetMinutes === null) {
    return null;
  }

  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, "0");
  const minutes = String(absoluteMinutes % 60).padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

export function isPresetPhotoTimeMode(mode) {
  return presetPhotoTimeModes.includes(mode);
}

export function isSupportedPhotoTimeMode(mode) {
  return normalizePhotoTimeMode(mode) !== null;
}

export function assertPhotoTimeMode(mode) {
  const normalized = normalizePhotoTimeMode(mode);
  if (!normalized) {
    throw new Error(`Invalid photo time mode: ${mode}`);
  }
  return normalized;
}

export function formatPhotoTimeModeLabel(mode) {
  return isPresetPhotoTimeMode(mode) ? mode.toUpperCase() : mode;
}

export function splitFixedOffsetTimeMode(mode) {
  const normalized = normalizePhotoTimeMode(mode);
  if (!normalized || isPresetPhotoTimeMode(normalized)) {
    return null;
  }

  return {
    sign: normalized.startsWith("-") ? "-" : "+",
    time: normalized.slice(1),
  };
}

export function buildFixedOffsetTimeMode(sign, time) {
  if (sign !== "+" && sign !== "-") {
    throw new Error(`Invalid photo time mode: ${sign}${time || ""}`);
  }
  return assertPhotoTimeMode(`${sign}${time}`);
}