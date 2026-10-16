import { describe, expect, it, vi } from "vitest";
import { readdirSync, statSync, existsSync } from "node:fs";
vi.mock("leaflet", () => import("./helpers/leaflet-ui.js"));
import { builtinPluginCatalog } from "../src/builtins.js";
import { assertPluginId, normalizeDirectDefinition, validateImplementation } from "../src/plugins/runtime/catalog.js";
import { loadDirectoryDefinition } from "../src/plugins/runtime/discovery.js";
import { planDependencies } from "../src/plugins/runtime/planner.js";

const externalIds = readdirSync(new URL("../plugins/", import.meta.url), { withFileTypes: true })
  .filter(entry => entry.isDirectory()).map(entry => entry.name);
const builtinModules = ["domains", "renderers", "input", "ui"].flatMap(directory =>
  readdirSync(new URL(`../src/plugins/${directory}/`, import.meta.url)).filter(name => name.endsWith(".js"))
    .map(name => new URL(`../src/plugins/${directory}/${name}`, import.meta.url).href));

describe("official built-ins, independent external plugins and migration purge", () => {
  it("reserves the official catalog for unique tilia IDs and removes migration exceptions", () => {
    const ids = builtinPluginCatalog.map(entry => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith("tilia-")).toBe(true);
    for (const id of externalIds) {
      assertPluginId(id);
      expect(ids).not.toContain(id);
      expect(statSync(new URL(`../plugins/${id}/loader.js`, import.meta.url)).isFile()).toBe(true);
    }
    expect(existsSync(new URL("../src/plugins/migration-allowlist.js", import.meta.url))).toBe(false);
  });
  it("represents every repository built-in definition and validates all dependency closures", async () => {
    const builtinIds = new Set(builtinPluginCatalog.map(entry => entry.id));
    const definitions = (await Promise.all(builtinModules.map(async url => (await import(url)).default)))
      .filter(definition => definition !== undefined);
    expect(definitions.map(definition => definition.id).sort()).toEqual([...builtinIds].sort());
    const metadata = new Map(builtinPluginCatalog.map(entry => [entry.id, entry]));
    for (const definition of definitions) {
      const normalized = normalizeDirectDefinition(definition, builtinIds);
      expect(normalized.requires).toEqual(metadata.get(normalized.id).requires);
    }
    for (const id of externalIds) metadata.set(id, await loadDirectoryDefinition(id));
    expect(metadata.size).toBe(builtinIds.size + externalIds.length);
    for (const id of metadata.keys()) expect(planDependencies(id, metadata).order.at(-1)).toBe(id);
  });
  it.each(builtinPluginCatalog)("validates official $id through the shared implementation contract", async entry => {
    expect(validateImplementation(await entry.load(), entry).id).toBe(entry.id);
  });
  it.each(externalIds)("discovers independent %s without official registration", async id => {
    const entry = await loadDirectoryDefinition(id);
    expect(entry.id).toBe(id);
    expect(entry.directDefinition.setup).toBeTypeOf("function");
  });
});
