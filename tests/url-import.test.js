import { describe, expect, it } from "vitest";
import {
  getContentLength,
  isSupportedRemoteGpxContent,
  parseHttpUrl,
  resolveRemoteFileName,
} from "../src/core/input-utils.js";

describe("url import helpers", () => {
  it("accepts only http and https URLs", () => {
    expect(parseHttpUrl("https://example.com/track.gpx")?.toString()).toBe("https://example.com/track.gpx");
    expect(parseHttpUrl("http://example.com/track.gpx")?.toString()).toBe("http://example.com/track.gpx");
    expect(parseHttpUrl("ftp://example.com/track.gpx")).toBeNull();
  });

  it("derives a gpx filename from content disposition and content type", () => {
    const response = new Response("<gpx />", {
      headers: {
        "content-disposition": 'attachment; filename="track.xml"',
        "content-type": "application/gpx+xml",
      },
    });

    expect(resolveRemoteFileName("https://example.com/data", response)).toBe("track.xml.gpx");
  });

  it("reads content length when present", () => {
    const response = new Response("<gpx />", {
      headers: {
        "content-length": "1234",
      },
    });

    expect(getContentLength(response)).toBe(1234);
  });

  it("accepts gpx-like content and rejects obvious non-gpx content", () => {
    expect(isSupportedRemoteGpxContent("track.gpx", "application/octet-stream")).toBe(true);
    expect(isSupportedRemoteGpxContent("track.xml", "application/gpx+xml")).toBe(true);
    expect(isSupportedRemoteGpxContent("track", "application/xml")).toBe(true);
    expect(isSupportedRemoteGpxContent("image.jpg", "image/jpeg")).toBe(false);
  });
});