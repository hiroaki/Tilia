import { describe, expect, it } from "vitest";

import {
  formatProfileLabel,
  normalizeProfileId,
  resolveRouteProfileOptions,
} from "../plugins/x-route-search/loader.js";

describe("x-route-search loader", () => {
  it("normalizes profile identifiers to lowercase", () => {
    expect(normalizeProfileId(" Foot ")).toBe("foot");
  });

  it("keeps only known profile identifiers from configured options", () => {
    expect(resolveRouteProfileOptions({
      defaultProfile: "foot",
      profileOptions: ["bike", "Dangerous", "FOOT", "car", ""],
    })).toEqual({
      defaultProfile: "foot",
      profileOptions: ["bike", "foot", "car"],
      initialProfile: "foot",
    });
  });

  it("falls back to built-in profiles when configured options contain no known identifiers", () => {
    expect(resolveRouteProfileOptions({
      defaultProfile: "foot",
      profileOptions: ["unsafe", "walk-fast"],
    })).toEqual({
      defaultProfile: "foot",
      profileOptions: ["foot", "car", "bike"],
      initialProfile: "foot",
    });
  });

  it("falls back invalid defaultProfile to car", () => {
    expect(resolveRouteProfileOptions({
      defaultProfile: "helicopter",
    })).toEqual({
      defaultProfile: "car",
      profileOptions: ["car", "bike", "foot"],
      initialProfile: "car",
    });
  });

  it("formats known profile labels for display", () => {
    expect(formatProfileLabel("car")).toBe("Car");
    expect(formatProfileLabel("bike")).toBe("Bike");
    expect(formatProfileLabel("foot")).toBe("Foot");
  });
});