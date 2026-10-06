import { describe, expect, it } from "vitest";
import { getPhase4bPluginClassification } from "../src/plugins/migration-allowlist.js";

describe("repository plugins deferred after the Phase 4B cutover", () => {
  it.each([
    "x-track-editor",
    "x-gpx-export",
    "x-route-search",
    "x-milestone",
  ])("classifies %s as disabled until its target capabilities exist", (pluginId) => {
    expect(getPhase4bPluginClassification(pluginId)).toBe("disabled");
  });
});
