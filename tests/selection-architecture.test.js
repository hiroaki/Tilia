import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
function dependencies(path, visited = new Set()) {
  if (visited.has(path)) return visited;
  visited.add(path);
  const source = readFileSync(path, "utf8");
  for (const match of source.matchAll(/(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/g)) {
    const specifier = match[1];
    expect(specifier).not.toBe("leaflet");
    if (specifier.startsWith(".")) dependencies(resolve(dirname(path), specifier), visited);
  }
  return visited;
}

describe("Phase 4E architecture gate", () => {
  it("has no renderer, presentation, interaction, browser or domain-implementation dependency", () => {
    const paths = dependencies(resolve(root, "src/selection/index.js"));
    for (const path of paths) {
      expect(path).not.toMatch(/\/src\/(?:map|core|plugins|photo|gpx|ui)\//);
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/\b(?:document|window|HTMLElement|RenderGeneration|refreshView|createSelectionHub)\b/);
    }
    for (const file of ["store.js", "coordinator.js", "candidates.js"]) {
      expect(readFileSync(resolve(root, "src/selection", file), "utf8")).not.toMatch(/["'](?:gpx|photo)["']/);
    }
  });

  it("removes Selection Hub source and obsolete authority tests while retaining later-phase code", () => {
    expect(existsSync(resolve(root, "src/core/selection-hub.js"))).toBe(false);
    expect(existsSync(resolve(root, "tests/selection-hub.test.js"))).toBe(false);
    expect(existsSync(resolve(root, "src/core/interaction-hub.js"))).toBe(false);
    expect(existsSync(resolve(root, "plugins/x-track-editor/vendor/leaflet-partially-editable-polyline.js"))).toBe(true);
  });
});
