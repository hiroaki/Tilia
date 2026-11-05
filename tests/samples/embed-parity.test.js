import { expect, test } from "vitest";
import { readFileSync } from "node:fs";

// Both languages use the same implementation; localized content stays in HTML/GPX.
test("English and Japanese embed pages load the same external styles and module", () => {
  const pages = ["index.html", "index.ja.html"].map(name =>
    readFileSync(new URL(`../../samples/embed/${name}`, import.meta.url), "utf8"));
  for (const page of pages) {
    expect(page).toContain('<link rel="stylesheet" href="./embed.css" />');
    expect(page).toContain('<script type="module" src="./embed.js"></script>');
    expect(page).not.toMatch(/<style\b|<script type="module">/);
  }
  for (const name of ["embed.css", "embed.js"]) {
    expect(readFileSync(new URL(`../../samples/embed/${name}`, import.meta.url), "utf8").trim()).not.toBe("");
  }
});
