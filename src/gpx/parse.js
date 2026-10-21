import { normalizeGpxSource } from "./source.js";

export const MAX_ROUTES_PER_GPX = 20;
export const MAX_ROUTE_POINTS_PER_ROUTE = 100;

const GPX_1_1_NAMESPACE = "http://www.topografix.com/GPX/1/1";
const PARSER_ERROR_NAMESPACES = [
  "http://www.w3.org/1999/xhtml",
  "http://www.mozilla.org/newlayout/xml/parsererror.xml",
];

// GPX import policy:
// - Be tolerant of harmless producer deviations for interoperability. In
//   particular, a missing namespace, version, or creator is accepted.
// - Reject input when required geometry or structural interpretation cannot be
//   trusted, and never silently replace or drop invalid geometry.
// - Optional metadata may be ignored when invalid if geometry remains valid.
// - Do not interpret foreign structures as GPX merely because names match.
// - Reject DOCTYPE declarations before XML parsing; GPX does not need custom
//   entities, and entity handling must not depend on the DOM parser in use.
// This is intentionally narrower than complete GPX 1.1 schema validation.

function readText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

function elementNamespace(node) {
  return node?.namespaceURI || "";
}

function isElementNamed(node, tagName, namespace) {
  return node?.nodeType === 1
    && (node.localName === tagName || node.nodeName === tagName)
    && elementNamespace(node) === namespace;
}

function getDirectChildren(node, tagName, namespace) {
  return Array.from(node?.childNodes || []).filter((child) => isElementNamed(child, tagName, namespace));
}

function getDirectChildText(node, tagName, namespace) {
  const child = getDirectChildren(node, tagName, namespace)[0];
  return child ? String(child.textContent || "").trim() : undefined;
}

function hasParserError(doc) {
  if (!doc) {
    return true;
  }
  // Browsers may return either a parser-error document or a partially retained
  // document containing a diagnostic element. Only known browser diagnostic
  // namespaces are searched; same-named application data is not an error.
  const root = doc.documentElement;
  if (root?.localName === "parsererror" || root?.nodeName === "parsererror") {
    return true;
  }
  return PARSER_ERROR_NAMESPACES.some((namespace) =>
    (doc.getElementsByTagNameNS?.(namespace, "parsererror")?.length || 0) > 0);
}

function inspectXmlBeforeParsing(xmlText) {
  const source = String(xmlText);
  let index = 0;
  while (index < source.length) {
    const markupStart = source.indexOf("<", index);
    if (markupStart === -1) {
      return null;
    }
    if (source.startsWith("<!--", markupStart)) {
      const end = source.indexOf("-->", markupStart + 4);
      if (end === -1) {
        return null;
      }
      index = end + 3;
      continue;
    }
    if (source.startsWith("<![CDATA[", markupStart)) {
      const end = source.indexOf("]]>", markupStart + 9);
      if (end === -1) {
        return null;
      }
      index = end + 3;
      continue;
    }
    if (source.startsWith("<?", markupStart)) {
      const end = source.indexOf("?>", markupStart + 2);
      if (end === -1) {
        return "unterminated-processing-instruction";
      }
      index = end + 2;
      continue;
    }
    if (source.startsWith("<!DOCTYPE", markupStart)
      && /[\s[]/.test(source[markupStart + 9] || "")) {
      return "doctype";
    }
    index = markupStart + 1;
  }
  return null;
}

function validateRoot(doc, fileName) {
  const root = doc?.documentElement;
  if (!root || (root.localName !== "gpx" && root.nodeName !== "gpx")) {
    throw new Error(`Invalid GPX root in ${fileName}: expected <gpx>`);
  }

  const namespace = elementNamespace(root);
  // Namespace-free GPX is a deliberate compatibility exception. A different
  // non-empty namespace is not safely interpretable as GPX 1.1.
  if (namespace !== "" && namespace !== GPX_1_1_NAMESPACE) {
    throw new Error(`Unsupported GPX namespace in ${fileName}: ${namespace}`);
  }

  if (root.hasAttribute("version")) {
    const version = root.getAttribute("version").trim();
    if (version !== "1.1") {
      throw new Error(`Unsupported GPX version in ${fileName}: ${version || "empty"}`);
    }
  }

  return { root, namespace };
}

function parseCoordinate(pointNode, attributeName, minimum, maximum, context, fileName) {
  if (!pointNode.hasAttribute(attributeName)) {
    throw new Error(`Missing ${attributeName} on ${context} in ${fileName}`);
  }
  const trimmedValue = pointNode.getAttribute(attributeName).trim();
  if (trimmedValue === "") {
    throw new Error(`Invalid ${attributeName} on ${context} in ${fileName}: empty value`);
  }

  // Accept an unambiguous decimal/exponent notation, but do not infer GPX
  // coordinates from JavaScript-only hexadecimal, binary, or octal syntax.
  const decimalNumberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  if (!decimalNumberPattern.test(trimmedValue)) {
    throw new Error(`Invalid ${attributeName} on ${context} in ${fileName}: ${trimmedValue}`);
  }

  const value = Number(trimmedValue);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ${attributeName} on ${context} in ${fileName}: ${trimmedValue}`);
  }
  if (value < minimum || value > maximum) {
    throw new Error(`${attributeName} out of range on ${context} in ${fileName}: ${trimmedValue}`);
  }
  return value;
}

function parsePointCoordinates(pointNode, context, fileName) {
  return {
    lat: parseCoordinate(pointNode, "lat", -90, 90, context, fileName),
    // Tilia deliberately accepts both antimeridian representations and does
    // not normalize 180 to -180.
    lon: parseCoordinate(pointNode, "lon", -180, 180, context, fileName),
  };
}

function parseGpxDateTime(value) {
  if (value == null || value === "") {
    return undefined;
  }
  // A timezone is required for conversion to an absolute timestamp. XSD
  // permits it to be omitted, but assigning one implicitly would change the
  // meaning of otherwise valid geometry, so such optional metadata is ignored.
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) {
    return undefined;
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = "", zone, sign, offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const isEndOfDay = hour === 24;
  const hasZeroFraction = fraction === "" || /^\.0+$/.test(fraction);
  if (year === 0 || month < 1 || month > 12 || minute > 59 || second > 59 || hour > 24
    || (isEndOfDay && (minute !== 0 || second !== 0 || !hasZeroFraction))) {
    return undefined;
  }
  // Date.UTC treats years 0 through 99 as 1900 through 1999. Start from a
  // safe year and set the full year explicitly so early years retain their
  // meaning both during calendar validation and timestamp conversion.
  const calendarDate = new Date(0);
  calendarDate.setUTCHours(0, 0, 0, 0);
  calendarDate.setUTCFullYear(year, month, 0);
  const daysInMonth = calendarDate.getUTCDate();
  if (day < 1 || day > daysInMonth) {
    return undefined;
  }

  let offsetMinutes = 0;
  if (zone !== "Z") {
    const offsetHours = Number(offsetHourText);
    const offsetRemainder = Number(offsetMinuteText);
    if (offsetHours > 14 || offsetRemainder > 59 || (offsetHours === 14 && offsetRemainder !== 0)) {
      return undefined;
    }
    offsetMinutes = ((offsetHours * 60) + offsetRemainder) * (sign === "+" ? 1 : -1);
  }

  const milliseconds = Number((fraction.slice(1) + "000").slice(0, 3));
  const parsedDate = new Date(0);
  parsedDate.setUTCHours(0, 0, 0, 0);
  parsedDate.setUTCFullYear(year, month - 1, day);
  // XSD dateTime permits 24:00:00 only with zero lower-order components; it
  // denotes the first instant of the following day. Apply it after setting the
  // full year so rollover is preserved for years 0001 through 0099 as well.
  parsedDate.setUTCHours(hour, minute, second, milliseconds);
  const timestamp = parsedDate.getTime() - (offsetMinutes * 60_000);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function parseTracks(root, namespace, fileName) {
  return getDirectChildren(root, "trk", namespace).map((trackNode, trackIndex) => ({
    name: getDirectChildText(trackNode, "name", namespace),
    segments: getDirectChildren(trackNode, "trkseg", namespace).map((segmentNode, segmentIndex) => ({
      points: getDirectChildren(segmentNode, "trkpt", namespace).map((pointNode, pointIndex) => ({
        ...parsePointCoordinates(pointNode, `trkpt #${pointIndex + 1} in segment #${segmentIndex + 1} of track #${trackIndex + 1}`, fileName),
        elevation: getDirectChildText(pointNode, "ele", namespace),
        timestamp: parseGpxDateTime(getDirectChildText(pointNode, "time", namespace)),
      })),
    })),
  }));
}

function parseRoutes(root, namespace, fileName) {
  const routeNodes = getDirectChildren(root, "rte", namespace);
  if (routeNodes.length > MAX_ROUTES_PER_GPX) {
    throw new Error(`Too many GPX routes in ${fileName}: ${routeNodes.length} > ${MAX_ROUTES_PER_GPX}`);
  }

  return routeNodes.map((routeNode, routeIndex) => {
    const pointNodes = getDirectChildren(routeNode, "rtept", namespace);
    if (pointNodes.length > MAX_ROUTE_POINTS_PER_ROUTE) {
      throw new Error(`Too many route points in GPX route #${routeIndex + 1} of ${fileName}: ${pointNodes.length} > ${MAX_ROUTE_POINTS_PER_ROUTE}`);
    }
    return {
      name: getDirectChildText(routeNode, "name", namespace),
      points: pointNodes.map((pointNode, pointIndex) => ({
        ...parsePointCoordinates(pointNode, `rtept #${pointIndex + 1} in route #${routeIndex + 1}`, fileName),
        name: getDirectChildText(pointNode, "name", namespace) || "",
      })),
    };
  });
}

function parseWaypoints(root, namespace, fileName) {
  return getDirectChildren(root, "wpt", namespace).map((node, pointIndex) => ({
    ...parsePointCoordinates(node, `wpt #${pointIndex + 1}`, fileName),
    name: getDirectChildText(node, "name", namespace) || "",
  }));
}

export function parseGpxText(xmlText, options = {}) {
  const { fileName = "track.gpx", createDomParser = () => new DOMParser() } = options;
  const preparseInspection = inspectXmlBeforeParsing(xmlText);
  if (preparseInspection === "doctype") {
    throw new Error(`DOCTYPE is not allowed in GPX: ${fileName}`);
  }
  if (preparseInspection === "unterminated-processing-instruction") {
    throw new Error(`Invalid GPX XML: ${fileName}`);
  }
  const parseErrors = [];
  const parser = createDomParser({ onError(message) { parseErrors.push(message); } });
  let doc;
  try {
    doc = parser.parseFromString(xmlText, "application/xml");
  } catch {
    throw new Error(`Invalid GPX XML: ${fileName}`);
  }
  if (hasParserError(doc) || parseErrors.length > 0) {
    throw new Error(`Invalid GPX XML: ${fileName}`);
  }

  const { root, namespace } = validateRoot(doc, fileName);
  return normalizeGpxSource({
    name: fileName,
    tracks: parseTracks(root, namespace, fileName),
    routes: parseRoutes(root, namespace, fileName),
    waypoints: parseWaypoints(root, namespace, fileName),
  });
}

export async function parseGpxFile(file) {
  const xmlText = await readText(file);
  return parseGpxText(xmlText, { fileName: file.name });
}
