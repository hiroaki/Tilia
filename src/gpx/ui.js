import { listen, node } from "../ui/scoped-dom.js";
import { resolveGpxTarget } from "./document.js";
import { formatGpxSummary, getTrackDisplayName } from "./interpretation.js";
import { TRACK_STYLE_PRESETS } from "../map/track-style-presets.js";
import { createWaypointPopupContent, createRoutePointPopupContent, createTrackPointPopupContent } from "./popup.js";

export function mountGpxRow({ container, scope, entry, gpx, selection, report }) {
  const { data, preferences } = gpx.get(entry.id).snapshot;
  const select = (parent, label, target, className = "tilia-gpx-node") => {
    const button = node(parent, "button", className, label);
    listen(scope, button, "click", () => selection.request(gpx.selection.createCandidate(entry.id, target)), report);
  };
  select(container, data.name, { kind: "document" }, "tilia-layer-name");
  node(container, "div", "tilia-layer-meta", formatGpxSummary(data));
  const tree = node(container, "ul", "tilia-gpx-tree");
  for (const category of ["tracks", "routes", "waypoints"]) {
    const item = node(tree, "li", "tilia-gpx-category");
    const label = node(item, "label", "", category);
    const toggle = node(label, "input", "tilia-gpx-category-visible");
    toggle.type = "checkbox"; toggle.checked = preferences[`${category}Visible`];
    toggle.setAttribute("aria-label", `${data.name} ${category}`);
    listen(scope, toggle, "change", () => gpx.setCategoryVisibility(entry.id, { category, visible: toggle.checked }, { expectedRevision: gpx.get(entry.id).revision }), report);
    const children = node(item, "ul", "tilia-gpx-children");
    if (category === "tracks") data.tracks.forEach((track, trackIndex) => {
      const child = node(children, "li", "tilia-gpx-track");
      const check = node(child, "input", "tilia-gpx-track-visible");
      check.type = "checkbox"; check.checked = preferences.trackVisibility[trackIndex] !== false;
      check.setAttribute("aria-label", `${data.name} show track ${trackIndex + 1}`);
      listen(scope, check, "change", () => gpx.setTrackVisibility(entry.id, { trackIndex, visible: check.checked }, { expectedRevision: gpx.get(entry.id).revision }), report);
      select(child, getTrackDisplayName(track, trackIndex), { kind: "track", trackIndex });
      const segments = node(child, "ul", "tilia-gpx-segments");
      track.segments.forEach((segment, segmentIndex) => {
        const segmentNode = node(segments, "li", "tilia-gpx-segment");
        select(segmentNode, `Segment #${segmentIndex + 1} (${segment.points.length} points)`, { kind: "segment", trackIndex, segmentIndex });
      });
    });
    else if (category === "routes") data.routes.forEach((route, routeIndex) => {
      const child = node(children, "li", "tilia-gpx-route");
      select(child, route.name || `Route #${routeIndex + 1}`, { kind: "route", routeIndex });
      const points = node(child, "ul", "tilia-gpx-route-points");
      route.points.forEach((point, pointIndex) => select(node(points, "li", ""), point.name || `Point #${pointIndex + 1}`, { kind: "route-point", routeIndex, pointIndex }));
    });
    else data.waypoints.forEach((point, waypointIndex) => select(node(children, "li", ""), point.name || `Waypoint #${waypointIndex + 1}`, { kind: "waypoint", waypointIndex }));
  }
  const style = node(container, "select", "tilia-gpx-style-select");
  style.setAttribute("aria-label", `${data.name} style`);
  for (const id of [...new Set(["default", ...TRACK_STYLE_PRESETS.map((p) => p.id), preferences.stylePresetId])]) { const option = node(style, "option", "", id); option.value = id; }
  style.value = preferences.stylePresetId;
  listen(scope, style, "change", () => gpx.setStylePreset(entry.id, style.value, { expectedRevision: gpx.get(entry.id).revision }), report);
}
export function mountGpxPopup({ container, selection, gpx }) {
  const view = gpx.get(selection.entryId), document = view.snapshot.data;
  const ref = selection.ref;
  const value = resolveGpxTarget(document, ref);
  if (ref.kind === "waypoint") container.appendChild(createWaypointPopupContent(document.name, value));
  else if (ref.kind === "route-point") container.appendChild(createRoutePointPopupContent(document, value, ref));
  else if (ref.kind === "track-point") {
    const samples = gpx.getElevationProfile(selection.entryId, { target: { kind: "track", trackIndex: ref.trackIndex } }).profiles[0].samples;
    const sample = samples.find((s) => s.locator.segmentIndex === ref.segmentIndex && s.locator.pointIndex === ref.pointIndex);
    container.appendChild(createTrackPointPopupContent({ ...document, name: document.tracks[ref.trackIndex].name || document.name }, { ...value, distanceMeters: sample?.distanceMeters }));
  } else {
    node(container, "h3", "tilia-popup-title", value.name || document.name);
    node(container, "div", "tilia-popup-row", `Type: ${ref.kind}`);
    const metadata = ref.kind === "document" ? document.metadata : value;
    if (ref.kind === "document" && metadata.name) node(container, "div", "tilia-popup-row", `Name: ${metadata.name}`);
    if (metadata.description) node(container, "div", "tilia-popup-row", `Description: ${metadata.description}`);
    if (Object.hasOwn(metadata, "timestamp")) {
      const date = new Date(metadata.timestamp);
      node(container, "div", "tilia-popup-row", `Time: ${metadata.timestamp === null || !Number.isFinite(date.getTime()) ? "-" : date.toLocaleString()}`);
    }
    node(container, "div", "tilia-popup-row", `Distance: ${Math.round(gpx.getDistance(selection.entryId, { target: ref }).totalMeters)} m`);
  }
}
