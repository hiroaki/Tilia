import { expect, test } from "vitest";
import { readFileSync } from "node:fs";

// Each page remains a self-contained embedding example; only its language differs.
test("English and Japanese embed pages use identical styles and application code", () => {
  const pages = ["index.html", "index.ja.html"].map(name =>
    readFileSync(new URL(`../../samples/embed/${name}`, import.meta.url), "utf8"));
  for (const pattern of [/<style>([\s\S]*?)<\/style>/, /<script type="module">([\s\S]*?)<\/script>/]) {
    expect(pages[0].match(pattern)[1]).toBe(pages[1].match(pattern)[1]);
  }
});
