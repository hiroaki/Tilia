import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import {
  MAX_ROUTES_PER_GPX,
  MAX_ROUTE_POINTS_PER_ROUTE,
  parseGpxText,
} from "../src/gpx/parse.js";

function createXmldomParser({ onError } = {}) {
  return new DOMParser({ errorHandler: { warning: onError, error: onError, fatalError: onError } });
}

describe("parseGpxText", () => {
  it("normalizes a GPX document without routes to an empty routes collection", () => {
    const parsed = parseGpxText("<gpx/>", { createDomParser: createXmldomParser });

    expect(parsed.routes).toEqual([]);
  });

  it("preserves route and route-point order with their supported fields", () => {
    const xml = `<gpx><rte><name>First</name><rtept lat="35" lon="135"><name>Start</name></rtept><rtept lat="35.1" lon="135.1"><name>Goal</name></rtept></rte><rte><rtept lat="36" lon="136"/></rte></gpx>`;
    const parsed = parseGpxText(xml, { fileName: "routes.gpx", createDomParser: createXmldomParser });

    expect(parsed.routes).toEqual([
      {
        name: "First",
        points: [
          { lat: 35, lon: 135, name: "Start" },
          { lat: 35.1, lon: 135.1, name: "Goal" },
        ],
      },
      {
        name: undefined,
        points: [{ lat: 36, lon: 136, name: "" }],
      },
    ]);
  });

  it("preserves empty routes", () => {
    const parsed = parseGpxText(`<gpx><rte><name>Empty</name></rte></gpx>`, {
      createDomParser: createXmldomParser,
    });

    expect(parsed.routes).toEqual([{ name: "Empty", points: [] }]);
  });

  it("accepts the maximum number of routes and rejects one more", () => {
    const route = "<rte/>";
    const accepted = parseGpxText(`<gpx>${route.repeat(MAX_ROUTES_PER_GPX)}</gpx>`, {
      fileName: "twenty.gpx",
      createDomParser: createXmldomParser,
    });

    expect(accepted.routes).toHaveLength(MAX_ROUTES_PER_GPX);
    expect(() => parseGpxText(`<gpx>${route.repeat(MAX_ROUTES_PER_GPX + 1)}</gpx>`, {
      fileName: "twenty-one.gpx",
      createDomParser: createXmldomParser,
    })).toThrow(/Too many GPX routes.*21.*20/);
  });

  it("accepts the maximum route-point count and rejects one more before normalization", () => {
    const validPoint = '<rtept lat="35" lon="135"/>';
    const accepted = parseGpxText(`<gpx><rte>${validPoint.repeat(MAX_ROUTE_POINTS_PER_ROUTE)}</rte></gpx>`, {
      fileName: "one-hundred.gpx",
      createDomParser: createXmldomParser,
    });

    expect(accepted.routes[0].points).toHaveLength(MAX_ROUTE_POINTS_PER_ROUTE);

    const invalidPoint = '<rtept lat="NaN" lon="135"/>';
    expect(() => parseGpxText(`<gpx><rte>${invalidPoint}${validPoint.repeat(MAX_ROUTE_POINTS_PER_ROUTE)}</rte></gpx>`, {
      fileName: "one-hundred-one.gpx",
      createDomParser: createXmldomParser,
    })).toThrow(/Too many route points.*#1.*101.*100/);
  });

  it("applies the route-point limit independently to each route", () => {
    const point = '<rtept lat="35" lon="135"/>';
    const route = `<rte>${point.repeat(MAX_ROUTE_POINTS_PER_ROUTE)}</rte>`;
    const parsed = parseGpxText(`<gpx>${route}${route}</gpx>`, {
      createDomParser: createXmldomParser,
    });

    expect(parsed.routes.map(({ points }) => points.length)).toEqual([100, 100]);
  });

  it("preserves track, segment, and point order", () => {
    const xml = `<gpx><trk><name>A</name><trkseg><trkpt lat="35" lon="135"/></trkseg><trkseg><trkpt lat="36" lon="136"><ele>12</ele><time>2024-01-01T00:00:00Z</time></trkpt></trkseg></trk><trk><trkseg><trkpt lat="37" lon="137"/></trkseg></trk></gpx>`;
    const parsed = parseGpxText(xml, { fileName: "many.gpx", createDomParser: createXmldomParser });
    expect(parsed.tracks).toEqual([
      { name: "A", segments: [{ points: [{ lat: 35, lon: 135, elevation: null, timestamp: null }] }, { points: [{ lat: 36, lon: 136, elevation: 12, timestamp: Date.parse("2024-01-01T00:00:00Z") }] }] },
      { name: undefined, segments: [{ points: [{ lat: 37, lon: 137, elevation: null, timestamp: null }] }] },
    ]);
  });
  it("throws a file-scoped error for invalid GPX XML", () => {
    expect(() => parseGpxText("<gpx><trk>", { fileName: "broken.gpx", createDomParser: createXmldomParser })).toThrow("Invalid GPX XML: broken.gpx");
  });

  it.each([
    ["missing closing tags", `<gpx><trk><trkseg>`],
    ["invalid nesting", `<gpx><trk></rte></gpx>`],
  ])("rejects malformed XML with %s", (_label, xml) => {
    expect(() => parseGpxText(xml, { fileName: "malformed.gpx", createDomParser: createXmldomParser }))
      .toThrow("Invalid GPX XML: malformed.gpx");
  });

  it("rejects a browser-style parser-error document", () => {
    const parserErrorDocument = new DOMParser().parseFromString(
      `<parsererror xmlns="http://www.mozilla.org/newlayout/xml/parsererror.xml">XML parsing error</parsererror>`,
      "application/xml",
    );
    expect(() => parseGpxText(`<gpx/>`, {
      fileName: "browser-error.gpx",
      createDomParser: () => ({ parseFromString: () => parserErrorDocument }),
    })).toThrow("Invalid GPX XML: browser-error.gpx");
  });

  it("rejects errors reported through the XML parser callback", () => {
    expect(() => parseGpxText(`<gpx/>`, {
      fileName: "callback-error.gpx",
      createDomParser({ onError }) {
        return {
          parseFromString() {
            onError("XML parsing error");
            return new DOMParser().parseFromString(`<gpx/>`, "application/xml");
          },
        };
      },
    })).toThrow("Invalid GPX XML: callback-error.gpx");
  });

  it("rejects empty XML with a GPX import error", () => {
    expect(() => parseGpxText("", { fileName: "empty.gpx", createDomParser: createXmldomParser }))
      .toThrow(/(?:Invalid GPX XML|Invalid GPX root).*empty\.gpx/);
  });

  it.each([
    ["wrong root", `<not-gpx><trk><trkseg><trkpt lat="1" lon="2"/></trkseg></trk></not-gpx>`, /Invalid GPX root/],
    ["GPX 1.0 namespace", `<gpx xmlns="http://www.topografix.com/GPX/1/0"/>`, /Unsupported GPX namespace/],
    ["foreign namespace", `<gpx xmlns="urn:foreign"/>`, /Unsupported GPX namespace/],
    ["version 1.0", `<gpx version="1.0"/>`, /Unsupported GPX version/],
    ["other version", `<gpx version="2"/>`, /Unsupported GPX version/],
    ["empty version", `<gpx version=""/>`, /Unsupported GPX version/],
    ["whitespace-only version", `<gpx version="   "/>`, /Unsupported GPX version/],
  ])("rejects %s", (_label, xml, expected) => {
    expect(() => parseGpxText(xml, { createDomParser: createXmldomParser })).toThrow(expected);
  });

  it.each([
    ["GPX 1.1 namespace and version", `<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="test"/>`],
    ["missing namespace", `<gpx version="1.1" creator="test"/>`],
    ["missing version", `<gpx xmlns="http://www.topografix.com/GPX/1/1" creator="test"/>`],
    ["missing creator", `<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1"/>`],
    ["empty creator", `<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator=""/>`],
  ])("accepts %s", (_label, xml) => {
    expect(parseGpxText(xml, { createDomParser: createXmldomParser })).toMatchObject({
      tracks: [], routes: [], waypoints: [],
    });
  });

  it("only reads core elements at their expected structural position and namespace", () => {
    const xml = `<gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:f="urn:foreign">
      <extensions>
        <wpt lat="1" lon="2"/>
        <trk><trkseg><trkpt lat="1" lon="2"/></trkseg></trk>
      </extensions>
      <f:wpt lat="3" lon="4"/>
      <f:rte><f:rtept lat="3" lon="4"/></f:rte>
      <f:trk><f:trkseg><f:trkpt lat="3" lon="4"/></f:trkseg></f:trk>
      <wpt lat="5" lon="6"><extensions><name>Wrong</name></extensions></wpt>
      <rte><extensions><name>Wrong route</name><rtept lat="7" lon="8"/></extensions></rte>
      <trk><extensions><name>Wrong track</name></extensions></trk>
    </gpx>`;
    const parsed = parseGpxText(xml, { createDomParser: createXmldomParser });

    expect(parsed.waypoints).toEqual([{ lat: 5, lon: 6, name: "" }]);
    expect(parsed.routes).toEqual([{ name: undefined, points: [] }]);
    expect(parsed.tracks).toEqual([]);
  });

  it.each([
    [
      "a foreign extension in namespaced GPX",
      `<gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:x="urn:example">
        <extensions><x:parsererror>Application-specific data</x:parsererror></extensions>
        <wpt lat="1" lon="2"/>
      </gpx>`,
    ],
    [
      "a namespace-free extension",
      `<gpx><extensions><parsererror>Application-specific data</parsererror></extensions><wpt lat="1" lon="2"/></gpx>`,
    ],
    [
      "a root-level foreign element",
      `<gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:x="urn:example">
        <x:parsererror>Application-specific data</x:parsererror>
        <wpt lat="1" lon="2"/>
      </gpx>`,
    ],
  ])("does not mistake parsererror application data in %s for an XML failure", (_label, xml) => {
    expect(parseGpxText(xml, { createDomParser: createXmldomParser }).waypoints)
      .toEqual([{ lat: 1, lon: 2, name: "" }]);
  });

  it("keeps namespace-free core elements while ignoring foreign and nested lookalikes", () => {
    const xml = `<gpx xmlns:f="urn:foreign">
      <wpt lat="1" lon="2"/>
      <rte><rtept lat="3" lon="4"/></rte>
      <trk><trkseg><trkpt lat="5" lon="6"/></trkseg></trk>
      <f:wpt lat="bad" lon="bad"/>
      <f:rte><f:rtept lat="bad" lon="bad"/></f:rte>
      <f:trk><f:trkseg><f:trkpt lat="bad" lon="bad"/></f:trkseg></f:trk>
      <f:wrapper>
        <f:wpt lat="bad" lon="bad"/>
        <wpt xmlns="" lat="bad" lon="bad"/>
      </f:wrapper>
      <extensions><wpt lat="bad" lon="bad"/></extensions>
    </gpx>`;
    const parsed = parseGpxText(xml, { createDomParser: createXmldomParser });

    expect(parsed.waypoints).toEqual([{ lat: 1, lon: 2, name: "" }]);
    expect(parsed.routes).toEqual([{ name: undefined, points: [{ lat: 3, lon: 4, name: "" }] }]);
    expect(parsed.tracks).toEqual([{
      name: undefined,
      segments: [{ points: [{ lat: 5, lon: 6, elevation: null, timestamp: null }] }],
    }]);
  });

  const pointCases = [
    ["wpt", (attributes) => `<wpt ${attributes}/>`],
    ["rtept", (attributes) => `<rte><rtept ${attributes}/></rte>`],
    ["trkpt", (attributes) => `<trk><trkseg><trkpt ${attributes}/></trkseg></trk>`],
  ];

  const mixedPointCases = [
    ["wpt", (first, second) => `<gpx><wpt ${first}/><wpt ${second}/></gpx>`],
    ["rtept", (first, second) => `<gpx><rte><rtept ${first}/><rtept ${second}/></rte></gpx>`],
    ["trkpt", (first, second) => `<gpx><trk><trkseg><trkpt ${first}/><trkpt ${second}/></trkseg></trk></gpx>`],
  ];

  it.each(mixedPointCases)("rejects the whole document for mixed valid and invalid %s elements", (_type, document) => {
    const valid = `lat="1" lon="2"`;
    const invalid = `lat="bad" lon="2"`;
    expect(() => parseGpxText(document(valid, invalid), { createDomParser: createXmldomParser }))
      .toThrow(/Invalid lat/);
    expect(() => parseGpxText(document(invalid, valid), { createDomParser: createXmldomParser }))
      .toThrow(/Invalid lat/);
  });

  it.each(pointCases)("validates required coordinates for %s", (_type, point) => {
    for (const [attributes, expected] of [
      [`lon="1"`, /Missing lat/],
      [`lat="1"`, /Missing lon/],
      [`lat="" lon="1"`, /Invalid lat/],
      [`lat="1" lon=""`, /Invalid lon/],
      [`lat=" " lon="1"`, /Invalid lat/],
      [`lat="1" lon=" "`, /Invalid lon/],
      [`lat="abc" lon="1"`, /Invalid lat/],
      [`lat="1" lon="abc"`, /Invalid lon/],
      [`lat="1" lon="123abc"`, /Invalid lon/],
      [`lat="NaN" lon="1"`, /Invalid lat/],
      [`lat="1" lon="Infinity"`, /Invalid lon/],
      [`lat="-Infinity" lon="1"`, /Invalid lat/],
      [`lat="91" lon="1"`, /lat out of range/],
      [`lat="-91" lon="1"`, /lat out of range/],
      [`lat="1" lon="180.0001"`, /lon out of range/],
      [`lat="1" lon="-180.0001"`, /lon out of range/],
    ]) {
      expect(() => parseGpxText(`<gpx>${point(attributes)}</gpx>`, {
        createDomParser: createXmldomParser,
      })).toThrow(expected);
    }
  });

  it.each(pointCases)("accepts coordinate boundaries and whole-string numeric notation for %s", (type, point) => {
    const parsed = parseGpxText(`<gpx>${point(`lat="-9e1" lon="180"`)}${point(`lat="90" lon="-180"`)}</gpx>`, {
      createDomParser: createXmldomParser,
    });
    const points = type === "wpt"
      ? parsed.waypoints
      : type === "rtept"
        ? parsed.routes.flatMap((route) => route.points)
        : parsed.tracks.flatMap((track) => track.segments.flatMap((segment) => segment.points));
    expect(points.map(({ lat, lon }) => ({ lat, lon }))).toEqual([
      { lat: -90, lon: 180 },
      { lat: 90, lon: -180 },
    ]);
  });

  it.each([
    ["unsigned integer", "1", 1],
    ["explicit plus sign", "+1", 1],
    ["negative decimal", "-1.25", -1.25],
    ["leading decimal point", ".5", 0.5],
    ["trailing decimal point", "1.", 1],
    ["exponent", "1e1", 10],
    ["uppercase exponent", "-9E1", -90],
    ["surrounding whitespace", "  1.5  ", 1.5],
  ])("accepts %s coordinate notation", (_label, input, expected) => {
    const parsed = parseGpxText(`<gpx><wpt lat="${input}" lon="0"/></gpx>`, {
      createDomParser: createXmldomParser,
    });
    expect(parsed.waypoints[0].lat).toBe(expected);
  });

  it("accepts exponent notation independently of geographic range validation", () => {
    const parsed = parseGpxText(`<gpx><wpt lat="0" lon="1e2"/></gpx>`, {
      createDomParser: createXmldomParser,
    });
    expect(parsed.waypoints[0].lon).toBe(100);
  });

  it.each([
    ["hexadecimal", "0x10"],
    ["binary", "0b10"],
    ["octal", "0o10"],
    ["numeric separator", "1_0"],
    ["trailing garbage", "12abc"],
  ])("rejects %s coordinate notation for every point type", (_label, input) => {
    for (const [, point] of pointCases) {
      expect(() => parseGpxText(`<gpx>${point(`lat="${input}" lon="0"`)}</gpx>`, {
        createDomParser: createXmldomParser,
      })).toThrow(/Invalid lat/);
    }
  });

  it.each([
    ["external entity", `<!DOCTYPE gpx [<!ENTITY external SYSTEM "file:///etc/passwd">]><gpx><wpt lat="1" lon="2"><name>&external;</name></wpt></gpx>`],
    ["internal entity", `<!DOCTYPE gpx [<!ENTITY name "expanded">]><gpx><wpt lat="1" lon="2"><name>&name;</name></wpt></gpx>`],
    ["nested entity expansion", `<!DOCTYPE gpx [<!ENTITY a "1234567890"><!ENTITY b "&a;&a;&a;&a;">]><gpx><wpt lat="1" lon="2"><name>&b;</name></wpt></gpx>`],
  ])("rejects a DOCTYPE with %s before invoking the XML parser", (_label, xml) => {
    let parserCreated = false;
    expect(() => parseGpxText(xml, {
      fileName: "entities.gpx",
      createDomParser() {
        parserCreated = true;
        return createXmldomParser();
      },
    })).toThrow("DOCTYPE is not allowed in GPX: entities.gpx");
    expect(parserCreated).toBe(false);
  });

  it("does not mistake DOCTYPE text in comments or CDATA for a declaration", () => {
    const xml = `<gpx>
      <!-- <!DOCTYPE gpx [<!ENTITY x "comment">]> -->
      <extensions><![CDATA[<!DOCTYPE gpx [<!ENTITY x "text">]>]]></extensions>
      <wpt lat="1" lon="2"/>
    </gpx>`;
    expect(parseGpxText(xml, { createDomParser: createXmldomParser }).waypoints)
      .toEqual([{ lat: 1, lon: 2, name: "" }]);
  });

  it.each([
    ["before the root", `<?producer <!DOCTYPE is only text?><gpx><wpt lat="1" lon="2"/></gpx>`],
    ["inside the root", `<gpx><?producer <!DOCTYPE is only text?><wpt lat="1" lon="2"/></gpx>`],
    ["after an XML declaration", `<?xml version="1.0"?><?producer <!DOCTYPE is only text?><gpx><wpt lat="1" lon="2"/></gpx>`],
  ])("does not mistake DOCTYPE text in a processing instruction %s for a declaration", (_label, xml) => {
    expect(parseGpxText(xml, { createDomParser: createXmldomParser }).waypoints)
      .toEqual([{ lat: 1, lon: 2, name: "" }]);
  });

  it.each([
    ["before", `<!DOCTYPE gpx><?producer data?><gpx/>`],
    ["after", `<?producer data?><!DOCTYPE gpx><gpx/>`],
  ])("rejects a real DOCTYPE %s a processing instruction before creating the parser", (_label, xml) => {
    let parserCreated = false;
    expect(() => parseGpxText(xml, {
      createDomParser() {
        parserCreated = true;
        return createXmldomParser();
      },
    })).toThrow(/DOCTYPE is not allowed/);
    expect(parserCreated).toBe(false);
  });

  it("reports an unterminated processing instruction as an XML parse error", () => {
    expect(() => parseGpxText(`<?producer <!DOCTYPE is only text<gpx/>`, {
      fileName: "unterminated-pi.gpx",
      createDomParser: createXmldomParser,
    })).toThrow("Invalid GPX XML: unterminated-pi.gpx");
  });

  it("keeps valid track geometry while normalizing invalid optional fields", () => {
    const xml = `<gpx><trk><trkseg>
      <trkpt lat="1" lon="2"><ele>12.5</ele><time>2024-01-02T03:04:05.678+09:00</time></trkpt>
      <trkpt lat="2" lon="3"><ele> </ele><time>not-a-date</time></trkpt>
      <trkpt lat="3" lon="4"><ele>bad</ele><time>2024-01-01</time></trkpt>
      <trkpt lat="4" lon="5"><ele>Infinity</ele><time>2024-02-30T00:00:00Z</time></trkpt>
      <trkpt lat="5" lon="6"><time>2024-01-02T03:04:05</time></trkpt>
    </trkseg></trk></gpx>`;
    const points = parseGpxText(xml, { createDomParser: createXmldomParser }).tracks[0].segments[0].points;

    expect(points).toEqual([
      { lat: 1, lon: 2, elevation: 12.5, timestamp: Date.parse("2024-01-02T03:04:05.678+09:00") },
      { lat: 2, lon: 3, elevation: null, timestamp: null },
      { lat: 3, lon: 4, elevation: null, timestamp: null },
      { lat: 4, lon: 5, elevation: null, timestamp: null },
      { lat: 5, lon: 6, elevation: null, timestamp: null },
    ]);
  });

  it.each([
    ["0001-01-01T00:00:00Z", "0001-01-01T00:00:00.000Z"],
    ["0099-01-01T00:00:00Z", "0099-01-01T00:00:00.000Z"],
    ["0100-01-01T00:00:00Z", "0100-01-01T00:00:00.000Z"],
    ["2024-01-02T03:04:05.678Z", "2024-01-02T03:04:05.678Z"],
    ["0001-01-01T01:02:03.456+01:00", "0001-01-01T00:02:03.456Z"],
    ["0099-01-01T00:00:00-01:00", "0099-01-01T01:00:00.000Z"],
    ["0004-02-29T00:00:00Z", "0004-02-29T00:00:00.000Z"],
  ])("converts GPX time %s without remapping early years", (input, expectedIso) => {
    const xml = `<gpx><trk><trkseg><trkpt lat="1" lon="2"><time>${input}</time></trkpt></trkseg></trk></gpx>`;
    const point = parseGpxText(xml, { createDomParser: createXmldomParser }).tracks[0].segments[0].points[0];

    expect(new Date(point.timestamp).toISOString()).toBe(expectedIso);
  });

  it.each([
    "0001-02-29T00:00:00Z",
    "0099-04-31T00:00:00Z",
  ])("ignores invalid early-year calendar date %s", (input) => {
    const xml = `<gpx><trk><trkseg><trkpt lat="1" lon="2"><time>${input}</time></trkpt></trkseg></trk></gpx>`;
    const point = parseGpxText(xml, { createDomParser: createXmldomParser }).tracks[0].segments[0].points[0];

    expect(point.timestamp).toBeNull();
  });
});
