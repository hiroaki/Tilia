import { describe, expect, it } from "vitest";

import { makeFileName } from "../plugins/x-gpx-export/loader.js";
import {
  formatTimestampForDateTimeLocal,
  parseDateTimeLocalToTimestamp,
} from "../plugins/x-track-editor/loader.js";

describe("track editor datetime-local helpers", () => {
  it("round-trips timestamps through datetime-local values without timezone drift", () => {
    const timestamp = new Date(2024, 4, 27, 18, 42, 15, 0).getTime();

    const formatted = formatTimestampForDateTimeLocal(timestamp);
    const reparsed = parseDateTimeLocalToTimestamp(formatted);

    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(reparsed).toBe(timestamp);
  });

  it("returns null for invalid datetime-local values", () => {
    expect(parseDateTimeLocalToTimestamp("2024-05-27T18:42Z")).toBeNull();
    expect(parseDateTimeLocalToTimestamp("not-a-date")).toBeNull();
  });
});

describe("gpx file name helpers", () => {
  it("preserves existing GPX extensions case-insensitively", () => {
    expect(makeFileName("TRACK.GPX")).toBe("TRACK.GPX");
    expect(makeFileName("Track.GpX")).toBe("Track.GpX");
  });

  it("adds a .gpx suffix when one is not present", () => {
    expect(makeFileName("track")).toBe("track.gpx");
  });
});