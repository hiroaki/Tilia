import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { builtinPluginCatalog } from "../src/builtins.js";
import { phase4cPluginClassification } from "../src/plugins/migration-allowlist.js";

describe("Phase 4C migration allowlist", () => {
  it("enables exactly the Phase 4C plugins and classifies every repository plugin once", () => {
    const pluginsDirectory = fileURLToPath(new URL("../plugins/", import.meta.url));
    const external = readdirSync(pluginsDirectory).filter((name) =>
      statSync(new URL(`../plugins/${name}/loader.js`, import.meta.url), { throwIfNoEntry: false })?.isFile());
    const repositoryIds = [...new Set([...builtinPluginCatalog.map(({ id }) => id), ...external])].sort();
    const classified = [...phase4cPluginClassification.enabled, ...phase4cPluginClassification.disabled];
    expect(phase4cPluginClassification.enabled).toEqual([
      "tilia-status", "tilia-base-maps-control", "x-gsi-base-maps", "x-opentopomap-base-maps",
    ]);
    expect(new Set(classified).size).toBe(classified.length);
    expect([...classified].sort()).toEqual(repositoryIds);
  });
});
