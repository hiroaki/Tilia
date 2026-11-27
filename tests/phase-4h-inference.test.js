import { expect, it } from "vitest";
import { inferPhotoLocationFromTimeline, PhotoInferenceNoMatchError } from "../src/photo/infer-location.js";
const p = (lat, timestamp) => ({ lat, lon: lat, timestamp });
const local = (points, time) => inferPhotoLocationFromTimeline({ points }, { dateTimeOriginal: new Date(time) }, { timeInterpretationMode: "local" });
it("uses the first exact duplicate and retains the legacy unlocated series for interpolation", () => {
  const points = [p(1, 0), p(2, 0), p(4, 10000), p(8, 10000)];
  expect(local(points, 0)).toMatchObject({ lat: 1, lon: 1, inferredTimestamp: 0, timeInterpretationMode: "local" });
  expect(local(points, 5000).lat).toBe(3);
  expect(local(points, 10000).lat).toBe(4);
  expect(local([p(1, 0)], 0).lat).toBe(1);
  expect(local([p(1, 0), p(2, 0)], 0).lat).toBe(1);
  expect(() => local(points, -1)).toThrow(PhotoInferenceNoMatchError);
});

const located = (lat, timestamp, entryId = 1, trackIndex = 0, segmentIndex = 0) =>
  ({ ...p(lat, timestamp), locator: { entryId, trackIndex, segmentIndex } });

it("finds exact and bracketing points in interleaved legacy evidence", () => {
  expect(local([located(5, 0), located(30, 1000, 2)], 0).lat).toBe(5);
  expect(local([located(0, 0), located(30, 1000, 2), located(10, 2000)], 1200).lat).toBe(6);
  expect(local([located(0, 0), located(30, 900, 2), located(40, 1900, 2), located(10, 2000)], 1000).lat).toBe(31);
});

it.each([
  p(20, 2000), located(20, 2000, 2), located(20, 2000, 1, 1),
  located(20, 2000, 1, 0, 1), { ...p(20, 2000), locator: { entryId: 1, trackIndex: 0 } },
])("only brackets legacy points in the same proven series (%j)", other => {
  expect(() => local([located(0, 0), other], 1000)).toThrow(PhotoInferenceNoMatchError);
  expect(local([located(0, 0), other], 2000).lat).toBe(20);
});

it.each([["external-A", "external-B"], [1, "1"]])(
  "keeps distinct legacy entry IDs apart (%j and %j)", (first, second) => {
    expect(() => local([located(0, 0, first), located(10, 2000, second)], 1200))
      .toThrow(PhotoInferenceNoMatchError);
  },
);

it("ranks numeric and string entry IDs independently even when they look alike", () => {
  const points = [located(0, 0, 1), located(20, 900, "1"), located(10, 2000, 1), located(40, 2900, "1")];
  expect(local(points, 1000).lat).toBe(21);
  expect(local(points, 500).lat).toBe(2.5);
});

it("ranks string entry IDs by nearest endpoint and then span", () => {
  const points = [
    located(10, 0, "wide"), located(20, 600, "far"), located(30, 900, "short"),
    located(10, 1100, "wide"), located(30, 1100, "short"), located(20, 1400, "far"),
  ];
  expect(local(points.filter(point => point.locator.entryId !== "short"), 1000).lat).toBe(10);
  expect(local(points, 1000).lat).toBe(30);
});

it("does not connect unlocated legacy points in a mixed timeline", () => {
  expect(() => local([p(0, 0), located(20, 1000), p(30, 3000)], 2000)).toThrow(PhotoInferenceNoMatchError);
});

it("interprets UTC using local calendar fields, auto breaks equal evidence ties toward local, and unsupported temporal evidence is no-match", () => {
  const date = new Date(2024, 0, 2, 3, 4, 5), localTime = date.getTime(), utcTime = Date.UTC(2024, 0, 2, 3, 4, 5);
  const points = [p(0, Math.min(localTime, utcTime) - 1000), p(1, Math.max(localTime, utcTime) + 1000)];
  expect(inferPhotoLocationFromTimeline({ points }, { dateTimeOriginal: date }, { timeInterpretationMode: "utc" }).inferredTimestamp).toBe(utcTime);
  expect(inferPhotoLocationFromTimeline({ points }, { dateTimeOriginal: date }).timeInterpretationMode).toBe("local");
  expect(() => local(points, 8.64e15 + 1)).toThrow(PhotoInferenceNoMatchError);
  expect(() => inferPhotoLocationFromTimeline({ points }, { dateTimeOriginal: date }, { timeInterpretationMode: "invalid" })).toThrow(/Invalid photo time mode/);
});

it("keeps the offline legacy inference wrapper usable with a canonical parsed document", async () => {
  const { DOMParser } = await import("@xmldom/xmldom");
  const { parseGpxText } = await import("../src/gpx/parse.js");
  const { inferPhotoLocationFromGpx } = await import("../src/photo/infer-location.js");
  const document = parseGpxText('<gpx><trk><trkseg><trkpt lat="0" lon="0"><time>1970-01-01T00:00:00Z</time></trkpt><trkpt lat="10" lon="10"><time>1970-01-01T00:00:10Z</time></trkpt></trkseg></trk></gpx>', { createDomParser: () => new DOMParser() });
  expect(inferPhotoLocationFromGpx([document], { dateTimeOriginal: new Date(5000) }, { timeInterpretationMode: "local" })).toMatchObject({ lat: 5, lon: 5 });
});
