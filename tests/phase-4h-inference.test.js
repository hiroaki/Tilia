import { expect, it } from "vitest";
import { inferPhotoLocationFromTimeline, PhotoInferenceNoMatchError } from "../src/photo/infer-location.js";
const p = (lat, timestamp) => ({ lat, lon: lat, timestamp });
const local = (points, time) => inferPhotoLocationFromTimeline({ points }, { dateTimeOriginal: new Date(time) }, { timeInterpretationMode: "local" });
it("uses the last exact duplicate and the first later duplicate while retaining two-point/endpoints policy", () => {
  const points = [p(1, 0), p(2, 0), p(4, 10000), p(8, 10000)];
  expect(local(points, 0)).toMatchObject({ lat: 2, lon: 2, inferredTimestamp: 0, timeInterpretationMode: "local" });
  expect(local(points, 5000).lat).toBe(3);
  for (const [data, time] of [[points, 10000], [[p(1, 0)], 0], [[p(1, 0), p(2, 0)], 0], [points, -1]]) {
    expect(() => local(data, time)).toThrow(PhotoInferenceNoMatchError);
  }
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
