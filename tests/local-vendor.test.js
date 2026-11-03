import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { init, parse } from "es-module-lexer/minimal";
import { files, root, source, distributions, upstreamFiles, leafletModule, parsedEdges, graph } from "./helpers/module-audit.js";

const expectedFiles = {
  leaflet: ["LICENSE", "leaflet.css", "leaflet.js", "leaflet.js.map"],
  exifr: ["LICENSE", "lite.esm.js"],
};

describe("component-owned browser dependencies", () => {
  it("preserves every upstream byte and audits the complete distribution inventories", async () => {
    expect(existsSync(resolve(root, "vendor"))).toBe(false);
    expect(distributions.map(item => [item.name, item.owner, item.version])).toEqual([
      ["leaflet", "Core map infrastructure", "2.0.0-beta.1"],
      ["exifr", "tilia-jpeg-input", "7.1.3"],
    ]);
    await init();
    for (const library of distributions) {
      expect(Object.keys(library.files).sort()).toEqual(expectedFiles[library.name]);
      expect(files(library.directory).sort()).toEqual([...expectedFiles[library.name], "manifest.json"].map(name => `${library.directory}/${name}`).sort());
      for (const [name, hash] of Object.entries(library.files)) {
        const path = `${library.directory}/${name}`;
        expect(createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex"), path).toBe(hash);
        if (name.endsWith(".js")) expect(parse(source(path))[0], path).toEqual([]);
      }
    }
    expect(JSON.parse(source("package.json")).dependencies.leaflet).toBe(distributions[0].version);
    for (const file of expectedFiles.leaflet) {
      const npmPath = file === "LICENSE" ? "node_modules/leaflet/LICENSE" : `node_modules/leaflet/dist/${file}`;
      expect(readFileSync(resolve(root, dirname(leafletModule), file)).equals(readFileSync(resolve(root, npmPath))), file).toBe(true);
    }
    const exifr = readFileSync(resolve(root, distributions[1].directory, "lite.esm.js"));
    expect(createHash("sha256").update(exifr).digest("hex")).toBe("9c18a09ddc50bb7f4171fa292e5593d6bf4b96857783b6e8e20cc6c0a53c73c1");
    const map = JSON.parse(source(`${dirname(leafletModule)}/leaflet.js.map`));
    expect(map.file).toBe("leaflet.js");
    expect(map.sourcesContent).toHaveLength(map.sources.length);
    const cssUrls = [...source(`${dirname(leafletModule)}/leaflet.css`).matchAll(/url\(([^)]*)\)/g)].map(match => match[1].replace(/^["']|["']$/g, ""));
    expect(cssUrls.every(url => url.startsWith("data:"))).toBe(true);
  });

  it("resolves all host import maps and CSS to the same Core distribution", () => {
    for (const path of [...files("samples"), ...files("tests/fixtures")].filter(path => path.endsWith(".html"))) {
      const html = source(path);
      const map = html.match(/<script\b[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/);
      if (!map) continue;
      const pageUrl = new URL(path, "https://tilia.test/");
      const baseHref = html.match(/<base\b[^>]*href=["']([^"']*)["']/i)?.[1];
      const baseUrl = baseHref === undefined ? pageUrl : new URL(baseHref, pageUrl);
      const imports = JSON.parse(map[1]);
      expect(imports.scopes, path).toBeUndefined();
      expect(imports.imports).not.toHaveProperty("exifr");
      const js = imports.imports.leaflet;
      const css = html.match(/href=["']([^"']*leaflet\.css)["']/)?.[1];
      for (const [url, file] of [[js, "leaflet.js"], [css, "leaflet.css"]]) {
        expect(url, path).toBeTruthy();
        const resolved = new URL(url, baseUrl);
        expect(resolved.href, path).toBe(new URL(`${dirname(leafletModule)}/${file}`, "https://tilia.test/").href);
        expect(existsSync(resolve(root, `.${resolved.pathname}`)), path).toBe(true);
      }
    }
  });

  it("keeps upstream boundaries explicit while auditing ordinary vendor-named code", async () => {
    await init();
    expect(() => parsedEdges("import(arbitrary)", "src/photo/vendor/unlisted.js")).toThrow();
    expect(upstreamFiles.has("src/photo/vendor/unlisted.js")).toBe(false);
    const all = await graph(["src/index.js"]);
    expect(all.has(leafletModule)).toBe(true);
    expect(all.has(`${distributions[1].directory}/lite.esm.js`)).toBe(true);
  });

  it("deploys component dependencies with src and prevents library CDN references", () => {
    const workflow = source(".github/workflows/sync-samples-to-githubio.yml");
    expect([...workflow.matchAll(/cp -r (\w+) githubio\/docs\/Tilia\/\1/g)].map(match => match[1]).sort()).toEqual(["plugins", "samples", "src"]);
    const paths = ["README.md", "README.ja.md", ...["src", "plugins", "samples", "tests", "docs"].flatMap(files)];
    const cdn = new RegExp("https?://(?:unpkg\\.com|cdn\\.jsdelivr\\.net|cdnjs\\.cloudflare\\.com|esm\\.sh)(?:/|\\b)");
    for (const path of paths.filter(path => /\.(?:js|mjs|html|css|json|md)$/.test(path))) expect(source(path), path).not.toMatch(cdn);
  });
});
