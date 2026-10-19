import { describe, expect, it, vi } from "vitest";
import gpx from "../src/plugins/input/gpx.js";

function handler() {
  const register = vi.fn();
  gpx.setup({ domains: { require: vi.fn() }, inputs: { register } });
  return register.mock.calls[0][0];
}

describe("GPX input recognition", () => {
  it.each([
    ["route.gpx", "", true],
    ["route.gpx", "application/octet-stream", true],
    ["route.GPX", "text/html", true],
    ["probe-id", "application/gpx+xml", true],
    ["probe-id", "application/gpx+xml; charset=utf-8", true],
    ["probe-id", "application/gpx+xml; charset=UTF-8", true],
    ["probe-id", "Application/GPX+XML; Charset=UTF-8", true],
    ["probe-id", ' application/gpx+xml ; charset="utf-8"; profile="test"', true],
    ["probe-id", "text/html", false],
    ["probe-id", "text/html; type=application/gpx+xml", false],
    ["probe-id", "application/xml", false],
    ["probe-id", "text/xml", false],
    ["probe-id", "application/octet-stream", false],
    ["probe-id", "", false],
    ["probe-id", "application/gpx+xml-extra", false],
    ["probe-id", "application/gpx+xml, text/html", false],
    ["route.gpx.html", "text/html", false],
  ])("recognizes %s with MIME %j: %s", (name, type, expected) => {
    // Valid GPX bytes must not make unrelated MIME types pass recognition.
    const input = new File(["<gpx/>"], name, { type });
    expect(handler().recognize(input)).toBe(expected);
  });

  it("compares media types case-insensitively even without native Blob normalization", () => {
    const input = new Blob(["<gpx/>"]);
    Object.defineProperty(input, "type", { value: "Application/GPX+XML; charset=UTF-8" });
    expect(handler().recognize(input)).toBe(true);
  });

  it("accepts unnamed GPX Blobs but still requires a Blob", () => {
    expect(handler().recognize(new Blob(["<gpx/>"], { type: "application/gpx+xml; charset=utf-8" }))).toBe(true);
    for (const input of [null, undefined, "route.gpx", { name: "route.gpx", type: "application/gpx+xml" }]) {
      expect(handler().recognize(input)).toBe(false);
    }
  });

  it("preserves discovery metadata", () => {
    expect(handler().discovery).toEqual({ extensions: [".gpx"], mimeTypes: ["application/gpx+xml"] });
  });
});
