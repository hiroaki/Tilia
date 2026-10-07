import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
// Production behavior/cleanup now lives in phase-4g-production.test.js. GPX
// category controls/styles are explicitly restored through domain adapters in 4H/4I.
describe("target generic layers host boundary", () => {
  it("contains no Photo/GPX policy or legacy mutable entries", () => {
    const source = readFileSync(new URL("../src/plugins/ui/layers-control.js", import.meta.url), "utf8");
    expect(source).not.toMatch(/photo|gpx|core\.state|entry\.source|entry\.kind/i);
    expect(source).toContain("context.contributions.layers.get(entry.domain)");
  });
});
