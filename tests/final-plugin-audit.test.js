import { describe, expect, it, vi } from "vitest";
import { readdirSync, statSync, existsSync } from "node:fs";
vi.mock("leaflet", () => import("./helpers/leaflet-ui.js"));
import { builtinPluginCatalog } from "../src/builtins.js";
import { validateImplementation } from "../src/plugins/runtime/catalog.js";

describe("final plugin catalog and purge", () => {
  it("keeps every repository loader in the normal explicit lazy catalog", () => {
    const external = readdirSync(new URL("../plugins/", import.meta.url)).filter(name => statSync(new URL(`../plugins/${name}/loader.js`, import.meta.url), { throwIfNoEntry: false })?.isFile());
    const ids = builtinPluginCatalog.map(entry => entry.id);
    for (const id of external) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(existsSync(new URL("../src/plugins/migration-allowlist.js", import.meta.url))).toBe(false);
  });
  it.each(builtinPluginCatalog)("validates $id through the same descriptor contract as external plugins", async entry => {
    const implementation = validateImplementation(await entry.load(), entry);
    expect(implementation.id).toBe(entry.id);
    expect(implementation.setup).toBeTypeOf("function");
  });
});
