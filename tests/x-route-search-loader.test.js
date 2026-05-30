import { describe, expect, it } from "vitest";

import {
  formatProfileLabel,
  normalizeProfileId,
  resolveRouteProfileOptions,
} from "../plugins/x-route-search/profiles.js";

describe("x-route-search profiles", () => {
  it("normalizes profile identifiers to lowercase", () => {
    expect(normalizeProfileId(" Foot ")).toBe("foot");
  });

  it("keeps only known profile identifiers from configured options", () => {
    expect(resolveRouteProfileOptions({
      defaultProfile: "foot",
      profileOptions: ["bike", "Dangerous", "FOOT", "car", ""],
    })).toEqual({
      profileOptions: ["bike", "foot", "car"],
      initialProfile: "foot",
    });
  });

  it("falls back to built-in profiles when configured options contain no known identifiers", () => {
    expect(resolveRouteProfileOptions({
      defaultProfile: "foot",
      profileOptions: ["unsafe", "walk-fast"],
    })).toEqual({
      profileOptions: ["foot", "car", "bike"],
      initialProfile: "foot",
    });
  });

  it("falls back invalid defaultProfile to car when no configured options are usable", () => {
    expect(resolveRouteProfileOptions({
      defaultProfile: "helicopter",
    })).toEqual({
      profileOptions: ["car", "bike", "foot"],
      initialProfile: "car",
    });
  });

  it("uses the first configured option when defaultProfile is invalid", () => {
    expect(resolveRouteProfileOptions({
      defaultProfile: "helicopter",
      profileOptions: ["bike", "foot"],
    })).toEqual({
      profileOptions: ["bike", "foot"],
      initialProfile: "bike",
    });
  });

  it("formats known profile labels for display", () => {
    expect(formatProfileLabel("car")).toBe("Car");
    expect(formatProfileLabel("bike")).toBe("Bike");
    expect(formatProfileLabel("foot")).toBe("Foot");
  });
});