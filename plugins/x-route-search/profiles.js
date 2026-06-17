const ROUTE_PROFILE_LABELS = Object.freeze({
  car: "Car",
  bike: "Bike",
  foot: "Foot",
});

const BUILTIN_ROUTE_PROFILE_IDS = Object.freeze(Object.keys(ROUTE_PROFILE_LABELS));
const BUILTIN_ROUTE_PROFILE_SET = new Set(BUILTIN_ROUTE_PROFILE_IDS);

export function normalizeProfileId(profile) {
  return String(profile ?? "").trim().toLowerCase();
}

export function isKnownRouteProfileId(profile) {
  return BUILTIN_ROUTE_PROFILE_SET.has(normalizeProfileId(profile));
}

export function formatProfileLabel(profile) {
  const normalizedProfile = normalizeProfileId(profile);
  if (!normalizedProfile) {
    return "Profile";
  }

  if (ROUTE_PROFILE_LABELS[normalizedProfile]) {
    return ROUTE_PROFILE_LABELS[normalizedProfile];
  }

  return normalizedProfile.charAt(0).toUpperCase() + normalizedProfile.slice(1);
}

export function resolveRouteProfileOptions(options = {}) {
  const normalizedDefaultProfile = normalizeProfileId(options.defaultProfile || "car");
  const preferredInitialProfile = isKnownRouteProfileId(normalizedDefaultProfile)
    ? normalizedDefaultProfile
    : "car";

  const configuredProfileOptions = Array.isArray(options.profileOptions)
    ? Array.from(new Set(options.profileOptions
      .map((profile) => normalizeProfileId(profile))
      .filter((profile) => isKnownRouteProfileId(profile))))
    : [];

  if (configuredProfileOptions.length === 0) {
    return {
      profileOptions: Array.from(new Set([preferredInitialProfile, ...BUILTIN_ROUTE_PROFILE_IDS])),
      initialProfile: preferredInitialProfile,
    };
  }

  return {
    profileOptions: configuredProfileOptions,
    initialProfile: configuredProfileOptions.includes(preferredInitialProfile)
      ? preferredInitialProfile
      : configuredProfileOptions[0],
  };
}