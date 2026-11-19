import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

it("pins the editor's complete upstream distribution and verifies every byte", () => {
  const directory = new URL("../plugins/x-track-editor/vendor/", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", directory)));
  expect(manifest.name).toBe("leaflet-partially-editable-polyline");
  expect(manifest.version).toBe("0.3.0");
  expect(readFileSync(new URL("version", directory), "utf8")).toBe("v0.3.0\n");
  expect(Object.keys(manifest.files).sort()).toEqual(["LICENSE", "leaflet-partially-editable-polyline.css", "leaflet-partially-editable-polyline.js"]);
  expect(readdirSync(directory).sort()).toEqual([...Object.keys(manifest.files), "manifest.json", "version"].sort());
  for (const [file, sha256] of Object.entries(manifest.files)) {
    expect(createHash("sha256").update(readFileSync(new URL(file, directory))).digest("hex"), file).toBe(sha256);
  }
});
