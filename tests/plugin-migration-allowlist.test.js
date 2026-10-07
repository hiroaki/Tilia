import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { builtinPluginCatalog } from "../src/builtins.js";
import { phase4dPluginClassification } from "../src/plugins/migration-allowlist.js";

describe("Phase 4D migration allowlist", () => {
  it("enables exactly the Phase 4H plugins and classifies every repository plugin once", () => {
    const pluginsDirectory = fileURLToPath(new URL("../plugins/", import.meta.url));
    const external = readdirSync(pluginsDirectory).filter((name) =>
      statSync(new URL(`../plugins/${name}/loader.js`, import.meta.url), { throwIfNoEntry: false })?.isFile());
    const repositoryIds = [...new Set([...builtinPluginCatalog.map(({ id }) => id), ...external])].sort();
    const classified = [...phase4dPluginClassification.enabled, ...phase4dPluginClassification.disabled];
    expect(phase4dPluginClassification.enabled).toEqual([
      "tilia-status", "tilia-base-maps-control", "tilia-gpx-domain", "tilia-photo-domain",
      "x-gsi-base-maps", "x-opentopomap-base-maps",
      "tilia-panel", "tilia-layers", "tilia-settings", "tilia-file-import",
      "tilia-gpx-renderer", "tilia-gpx-input", "tilia-gpx-ui",
      "tilia-photo-renderer", "tilia-jpeg-input", "tilia-photo-ui", "tilia-map-selection-presenter",
    ]);
    expect(new Set(classified).size).toBe(classified.length);
    expect([...classified].sort()).toEqual(repositoryIds);
  });
});
