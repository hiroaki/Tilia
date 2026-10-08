import { describe, expect, it } from "vitest";
import { getPhase4dPluginClassification } from "../src/plugins/migration-allowlist.js";

describe("repository plugins deferred after the Phase 4D cutover", () => {
  it.each([
    "x-milestone",
  ])("classifies %s as enabled after target capabilities exist", (pluginId) => {
    expect(getPhase4dPluginClassification(pluginId)).toBe("enabled");
  });
});
