import { describe, expect, it } from "vitest";
import { getPhase4cPluginClassification } from "../src/plugins/migration-allowlist.js";

describe("repository plugins deferred after the Phase 4C cutover", () => {
  it.each([
    "x-track-editor",
    "x-gpx-export",
    "x-route-search",
    "x-milestone",
  ])("classifies %s as disabled until its target capabilities exist", (pluginId) => {
    expect(getPhase4cPluginClassification(pluginId)).toBe("disabled");
  });
});
