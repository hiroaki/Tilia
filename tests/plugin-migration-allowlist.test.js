import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { builtinPluginCatalog } from "../src/builtins.js";
import { phase4bPluginClassification } from "../src/plugins/migration-allowlist.js";

describe("Phase 4B migration allowlist", () => {
  it("has an intentionally empty enabled set and classifies every repository plugin once", () => {
    const pluginsDirectory = fileURLToPath(new URL("../plugins/", import.meta.url));
    const external = readdirSync(pluginsDirectory).filter((name) =>
      statSync(new URL(`../plugins/${name}/loader.js`, import.meta.url), { throwIfNoEntry: false })?.isFile());
    const repositoryIds = [...builtinPluginCatalog.map(({ id }) => id), ...external].sort();
    const classified = [...phase4bPluginClassification.enabled, ...phase4bPluginClassification.disabled];
    expect(phase4bPluginClassification.enabled).toEqual([]);
    expect(new Set(classified).size).toBe(classified.length);
    expect([...classified].sort()).toEqual(repositoryIds);
  });
});
