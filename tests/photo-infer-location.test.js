import { describe, expect, it } from "vitest";
import { inferPhotoLocationFromGpx } from "../src/photo/infer-location.js";

function createTimelinePoint(timestamp, lat, lon) {
  return { timestamp, lat, lon };
}

class MockExifDate extends Date {
  constructor(localTimestamp, dateParts) {
    super(localTimestamp);
    this.localTimestamp = localTimestamp;
    this.dateParts = dateParts;
  }

  getTime() {
    return this.localTimestamp;
  }

  getFullYear() {
    return this.dateParts.year;
  }

  getMonth() {
    return this.dateParts.month;
  }

  getDate() {
    return this.dateParts.day;
  }

  getHours() {
    return this.dateParts.hour;
  }

  getMinutes() {
    return this.dateParts.minute;
  }

  getSeconds() {
    return this.dateParts.second;
  }

  getMilliseconds() {
    return this.dateParts.ms;
  }
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

  it("auto mode selects the local interpretation when only local fits the GPX timeline", () => {
    const photo = {
      name: "photo.jpg",
      dateTimeOriginal: new MockExifDate(1_700_000_000_000, {
        year: 2024,
        month: 0,
        day: 1,
        hour: 12,
        minute: 0,
        second: 0,
        ms: 0,
      }),
    };
    const sources = [
      {
        type: "gpx",
        trackTimeline: [
          createTimelinePoint(1_699_999_940_000, 35.0, 135.0),
          createTimelinePoint(1_700_000_060_000, 35.2, 135.2),
        ],
      },
    ];

    const result = inferPhotoLocationFromGpx(sources, photo, { timeInterpretationMode: "auto" });

    expect(result.timeInterpretationMode).toBe("local");
    expect(result.locationReason).toContain("AUTO");
  });

  it("auto mode selects the utc interpretation when only utc fits the GPX timeline", () => {
    const utcTimestamp = Date.UTC(2024, 0, 1, 12, 0, 0);
    const photo = {
      name: "photo.jpg",
      dateTimeOriginal: new MockExifDate(1_700_100_000_000, {
        year: 2024,
        month: 0,
        day: 1,
        hour: 12,
        minute: 0,
        second: 0,
        ms: 0,
      }),
    };
    const sources = [
      {
        type: "gpx",
        trackTimeline: [
          createTimelinePoint(utcTimestamp - 60_000, 35.0, 135.0),
          createTimelinePoint(utcTimestamp + 60_000, 35.2, 135.2),
        ],
      },
    ];

    const result = inferPhotoLocationFromGpx(sources, photo, { timeInterpretationMode: "auto" });

    expect(result.timeInterpretationMode).toBe("utc");
    expect(result.locationReason).toContain("AUTO");
  });

  it("supports explicit fixed offsets like +09:00", () => {
    const photo = {
      name: "photo.jpg",
      dateTimeOriginal: new MockExifDate(1_700_100_000_000, {
        year: 2024,
        month: 0,
        day: 1,
        hour: 12,
        minute: 0,
        second: 0,
        ms: 0,
      }),
    };
    const inferredTimestamp = Date.UTC(2024, 0, 1, 3, 0, 0);
    const sources = [
      {
        type: "gpx",
        trackTimeline: [
          createTimelinePoint(inferredTimestamp - 60_000, 35.0, 135.0),
          createTimelinePoint(inferredTimestamp + 60_000, 35.2, 135.2),
        ],
      },
    ];

    const result = inferPhotoLocationFromGpx(sources, photo, { timeInterpretationMode: "+09:00" });

    expect(result.timeInterpretationMode).toBe("+09:00");
    expect(result.lat).toBeCloseTo(35.1, 6);
    expect(result.lon).toBeCloseTo(135.1, 6);
  });

  it("rejects invalid fixed offset strings", () => {
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
      dateTimeOriginal: new Date(Date.UTC(2024, 0, 1, 0, 5, 0)),
    }, {
      timeInterpretationMode: "+25:00",
    })).toThrow("Invalid photo time mode");
  });
});