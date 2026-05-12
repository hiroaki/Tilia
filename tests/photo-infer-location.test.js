import { describe, expect, it } from "vitest";
import { inferPhotoLocationFromGpx } from "../src/photo/infer-location.js";

function createTimelinePoint(timestamp, lat, lon) {
  return { timestamp, lat, lon };
}

describe("inferPhotoLocationFromGpx", () => {
  it("interpolates a photo position from GPX timeline points", () => {
    const sources = [
      {
        type: "gpx",
        trackTimeline: [
          createTimelinePoint(Date.UTC(2024, 0, 1, 0, 0, 0), 35.0, 135.0),
          createTimelinePoint(Date.UTC(2024, 0, 1, 0, 10, 0), 35.1, 135.2),
        ],
      },
    ];

    const result = inferPhotoLocationFromGpx(sources, {
      name: "photo.jpg",
      dateTimeOriginal: new Date(Date.UTC(2024, 0, 1, 0, 5, 0)),
    });

    expect(result.locationSource).toBe("gpx-time-inference");
    expect(result.lat).toBeCloseTo(35.05, 6);
    expect(result.lon).toBeCloseTo(135.1, 6);
    expect(result.timeInterpretationMode).toBe("local");
  });

  it("sorts timeline points across multiple GPX sources before inferring", () => {
    const sources = [
      {
        type: "gpx",
        trackTimeline: [
          createTimelinePoint(Date.UTC(2024, 0, 1, 0, 10, 0), 35.1, 135.1),
        ],
      },
      {
        type: "gpx",
        trackTimeline: [
          createTimelinePoint(Date.UTC(2024, 0, 1, 0, 0, 0), 35.0, 135.0),
        ],
      },
      {
        type: "photo",
        trackTimeline: [
          createTimelinePoint(Date.UTC(2024, 0, 1, 0, 20, 0), 99, 99),
        ],
      },
    ];

    const result = inferPhotoLocationFromGpx(sources, {
      name: "photo.jpg",
      dateTimeOriginal: new Date(Date.UTC(2024, 0, 1, 0, 5, 0)),
    });

    expect(result.lat).toBeCloseTo(35.05, 6);
    expect(result.lon).toBeCloseTo(135.05, 6);
  });

  it("throws when the photo timestamp is outside the GPX range", () => {
    const sources = [
      {
        type: "gpx",
        trackTimeline: [
          createTimelinePoint(Date.UTC(2024, 0, 1, 0, 0, 0), 35.0, 135.0),
          createTimelinePoint(Date.UTC(2024, 0, 1, 0, 10, 0), 35.1, 135.2),
        ],
      },
    ];

    expect(() => inferPhotoLocationFromGpx(sources, {
      name: "photo.jpg",
      dateTimeOriginal: new Date(Date.UTC(2024, 0, 1, 0, 30, 0)),
    })).toThrow("outside GPX timeline range");
  });

  it("throws when the photo has no valid timestamp", () => {
    const sources = [
      {
        type: "gpx",
        trackTimeline: [
          createTimelinePoint(Date.UTC(2024, 0, 1, 0, 0, 0), 35.0, 135.0),
          createTimelinePoint(Date.UTC(2024, 0, 1, 0, 10, 0), 35.1, 135.2),
        ],
      },
    ];

    expect(() => inferPhotoLocationFromGpx(sources, {
      name: "photo.jpg",
      dateTimeOriginal: null,
    })).toThrow("No valid photo timestamp");
  });
});