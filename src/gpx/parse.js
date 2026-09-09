import { normalizeGpxSource } from "./source.js";

function readText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

function getElements(node, tagName) {
  return Array.from(node.getElementsByTagNameNS("*", tagName));
}

function getFirstChild(node, tagName) {
  return getElements(node, tagName)[0] || null;
}

function getDirectChildren(node, tagName) {
  return Array.from(node.childNodes || []).filter((child) =>
    child.nodeType === 1 && (child.localName === tagName || child.nodeName === tagName));
}

function getDirectChildText(node, tagName) {
  const child = getDirectChildren(node, tagName)[0];
  return child ? String(child.textContent || "").trim() : undefined;
}

function parseTracks(doc) {
  return getElements(doc, "trk").map((trackNode) => ({
    name: getDirectChildText(trackNode, "name"),
    segments: getDirectChildren(trackNode, "trkseg").map((segmentNode) => ({
      points: getDirectChildren(segmentNode, "trkpt").map((pointNode) => ({
        lat: Number(pointNode.getAttribute("lat")),
        lon: Number(pointNode.getAttribute("lon")),
        elevation: getDirectChildText(pointNode, "ele"),
        timestamp: getDirectChildText(pointNode, "time"),
      })),
    })),
  }));
}

function parseWaypoints(doc) {
  return getElements(doc, "wpt").map((node) => ({
    lat: Number(node.getAttribute("lat")),
    lon: Number(node.getAttribute("lon")),
    name: getFirstChild(node, "name")?.textContent || "",
  }));
}

export function parseGpxText(xmlText, options = {}) {
  const { fileName = "track.gpx", createDomParser = () => new DOMParser() } = options;
  const parseErrors = [];
  const parser = createDomParser({ onError(message) { parseErrors.push(message); } });
  const doc = parser.parseFromString(xmlText, "application/xml");
  const parserError = doc.querySelector?.("parsererror") || getFirstChild(doc, "parsererror");
  if (parserError || parseErrors.length > 0) {
    throw new Error(`Invalid GPX XML: ${fileName}`);
  }
  return normalizeGpxSource({ name: fileName, tracks: parseTracks(doc), waypoints: parseWaypoints(doc) });
}

export async function parseGpxFile(file) {
  const xmlText = await readText(file);
  return parseGpxText(xmlText, { fileName: file.name });
}