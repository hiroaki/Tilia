import { domainMount } from "../ui/domain-mount.js";
import { listen, node } from "../ui/scoped-dom.js";
import { resolveGpxTarget } from "./document.js";
import { formatGpxSummary, getTrackDisplayName } from "./interpretation.js";
import { TRACK_STYLE_PRESETS } from "../map/track-style-presets.js";
import { createWaypointPopupContent, createRoutePointPopupContent, createTrackPointPopupContent } from "./popup.js";

export function mountGpxRow(input) {
  const { container, scope, entry, gpx, selection, report, entries, map } = input;
  const model = domainMount({ ...input, domain: gpx });
  let structure, structuralScope, viewRevision, projections = [], buttons = [];
  const render = (view) => {
    viewRevision = view.revision;
    const { data } = view.snapshot;
    if (!structure) rebuild(data);
    for (const project of projections) project(view);
    const selected = selection.getCurrent();
    for (const { button, target } of buttons) {
      const match = selected?.entryId === entry.id && selected.ref.kind === target.kind && Object.entries(target).every(([key, value]) => selected.ref[key] === value);
      button.classList.toggle("tilia-gpx-selected", !!match); button.setAttribute("aria-pressed", String(!!match));
    }
  };
  const rebuild = (data) => {
    structure = data; void structuralScope?.dispose().catch(report); container.replaceChildren();
    structuralScope = scope.child({ label: "gpx-tree" }); projections = []; buttons = [];
    const child = structuralScope;
    const select = (parent, label, target, className = "tilia-gpx-node") => {
      const button = node(parent, "button", className, label); button.type = "button"; buttons.push({ button, target });
      projections.push((view) => {
        const value = resolveGpxTarget(view.snapshot.data, target);
        button.textContent = target.kind === "document" ? value.name : target.kind === "track" ? getTrackDisplayName(value, target.trackIndex) : target.kind === "segment" ? `Segment #${target.segmentIndex + 1} (${value.points.length} points)` : value.name || label;
      });
      const current = () => {
        if (!child.alive) return null;
        const view = model.current();
        return view?.revision === viewRevision ? view : null;
      };
      listen(child, button, "click", () => { if (current()) return selection.request(gpx.selection.createCandidate(entry.id, target)); }, report);
      const isPoint = ["waypoint", "route-point", "track-point"].includes(target.kind);
      const coordinate = (view) => {
        const point = resolveGpxTarget(view.snapshot.data, target);
        return Number.isFinite(point.lat) && Number.isFinite(point.lon) ? point : null;
      };
      const extent = (view) => gpx.getExtent(entry.id, {
        target: target.kind === "document" ? target : { ...target, revision: view.revision },
      }).bounds;
      const navigate = async () => {
        const view = current(); if (!view) return;
        if (isPoint) {
          if (!coordinate(view)) return;
          const requested = await selection.request(gpx.selection.createCandidate(entry.id, target));
          const latest = current();
          if (!latest || latest.revision !== view.revision || selection.getCurrent() !== requested) return;
          const point = coordinate(latest);
          if (point) map?.panTo({ lat: point.lat, lng: point.lon });
        } else {
          const bounds = extent(view), latest = current();
          if (bounds && latest?.revision === view.revision) map?.fitBounds(
            [[bounds.southWest.lat, bounds.southWest.lon], [bounds.northEast.lat, bounds.northEast.lon]],
            { padding: [20, 20], maxZoom: 18 },
          );
        }
      };
      const action = node(parent, "button", isPoint ? "tilia-control-button tilia-gpx-reveal" : "tilia-control-button tilia-gpx-fit", isPoint ? "Reveal" : "Fit");
      action.type = "button";
      projections.push((view) => {
        action.disabled = isPoint ? !coordinate(view) : !extent(view);
        action.setAttribute("aria-label", `${isPoint ? "Reveal" : "Fit"} ${button.textContent}`);
        action.title = action.disabled ? "No coordinates available" : "";
      });
      listen(child, action, "click", navigate, report);
      listen(child, button, "dblclick", (event) => { event.preventDefault(); return navigate(); }, report);
    };
    select(container, data.name, { kind: "document" }, "tilia-layer-name");
    const summary = node(container, "div", "tilia-layer-meta"); projections.push((v) => { summary.textContent = formatGpxSummary(v.snapshot.data); });
    const tree = node(container, "ul", "tilia-gpx-tree");
    for (const category of ["tracks", "routes", "waypoints"]) {
      const item = node(tree, "li", "tilia-gpx-category"), label = node(item, "label", "", category);
      const toggle = node(label, "input", "tilia-gpx-category-visible"); toggle.type = "checkbox"; model.controls.add(toggle); child.defer(() => model.controls.delete(toggle));
      toggle.setAttribute("aria-label", `${data.name} ${category}`);
      projections.push((v) => { toggle.checked = v.snapshot.preferences[`${category}Visible`]; });
      listen(child, toggle, "change", () => { const visible = toggle.checked; return model.command((v) => gpx.setCategoryVisibility(entry.id, { category, visible }, { expectedRevision: v.revision }), render); }, report);
      const children = node(item, "ul", "tilia-gpx-children");
      if (category === "tracks") data.tracks.forEach((track, trackIndex) => {
        const branch = node(children, "li", "tilia-gpx-track"), check = node(branch, "input", "tilia-gpx-track-visible"); check.type = "checkbox"; model.controls.add(check); child.defer(() => model.controls.delete(check));
        check.setAttribute("aria-label", `${data.name} show track ${trackIndex + 1}`);
        projections.push((v) => { check.checked = v.snapshot.preferences.trackVisibility[trackIndex] !== false; });
        listen(child, check, "change", () => { const visible = check.checked; return model.command((v) => gpx.setTrackVisibility(entry.id, { trackIndex, visible }, { expectedRevision: v.revision }), render); }, report);
        select(branch, getTrackDisplayName(track, trackIndex), { kind: "track", trackIndex });
        const segments = node(branch, "ul", "tilia-gpx-segments");
        track.segments.forEach((segment, segmentIndex) => select(node(segments, "li", "tilia-gpx-segment"), `Segment #${segmentIndex + 1} (${segment.points.length} points)`, { kind: "segment", trackIndex, segmentIndex }));
      });
      else if (category === "routes") data.routes.forEach((route, routeIndex) => {
        const branch = node(children, "li", "tilia-gpx-route"); select(branch, route.name || `Route #${routeIndex + 1}`, { kind: "route", routeIndex });
        const points = node(branch, "ul", "tilia-gpx-route-points"); route.points.forEach((point, pointIndex) => select(node(points, "li", ""), point.name || `Point #${pointIndex + 1}`, { kind: "route-point", routeIndex, pointIndex }));
      });
      else data.waypoints.forEach((point, waypointIndex) => select(node(children, "li", ""), point.name || `Waypoint #${waypointIndex + 1}`, { kind: "waypoint", waypointIndex }));
    }
  };
  if (entries) {
    const subscription = entries.subscribe((event) => {
      if (event.entry?.id === entry.id && event.change?.type === "replace-data") { structure = null; }
      if (event.entry?.id === entry.id || event.current?.id === entry.id || event.previous?.id === entry.id || event.type === "cleared") model.update(render);
    }, { emitCurrent: false }); scope.defer(() => subscription.unsubscribe(), { retry: "safe" });
  }
  const subscription = selection.subscribe(() => model.update(render)); scope.defer(() => subscription.unsubscribe(), { retry: "safe" });
  model.update(render);
}
export function mountGpxSettings(input) {
  const { container, scope, entry, gpx, report } = input, model = domainMount({ ...input, domain: gpx });
  container.classList.add("tilia-gpx-settings");
  const title = node(container, "h3", "tilia-gpx-settings-name");
  const label = node(container, "label", "tilia-gpx-setting-label", "GPX style");
  const style = node(label, "select", "tilia-control-select tilia-gpx-style-select");
  model.controls.add(style); style.setAttribute("aria-label", "GPX style");
  for (const id of [...new Set(["default", ...TRACK_STYLE_PRESETS.map((p) => p.id)])]) { const option = node(style, "option", "", id); option.value = id; }
  let data, controlsScope, project = [];
  const values = node(container, "div", "tilia-gpx-visibility-settings");
  const render = (view) => {
    title.textContent = view.snapshot.data.name;
    const preset = view.snapshot.preferences.stylePresetId;
    if (![...style.children].some((option) => option.value === preset)) { const option = node(style, "option", "", preset); option.value = preset; }
    style.value = preset;
    if (!data) {
      data = view.snapshot.data; void controlsScope?.dispose().catch(report); controlsScope = scope.child({ label: "visibility-settings" }); values.replaceChildren(); project = [];
      const checkbox = (label, checked, admit) => {
        const wrap = node(values, "label", "", label), toggle = node(wrap, "input", ""); toggle.type = "checkbox"; toggle.setAttribute("aria-label", label);
        model.controls.add(toggle); controlsScope.defer(() => model.controls.delete(toggle));
        project.push((v) => { toggle.checked = checked(v); });
        listen(controlsScope, toggle, "change", () => { const visible = toggle.checked; return model.command((v) => admit(visible, v.revision), render); }, report);
      };
      for (const category of ["tracks", "routes", "waypoints"]) checkbox(category, (v) => v.snapshot.preferences[`${category}Visible`], (visible, revision) => gpx.setCategoryVisibility(entry.id, { category, visible }, { expectedRevision: revision }));
      data.tracks.forEach((track, trackIndex) => checkbox(getTrackDisplayName(track, trackIndex), (v) => v.snapshot.preferences.trackVisibility[trackIndex] !== false, (visible, revision) => gpx.setTrackVisibility(entry.id, { trackIndex, visible }, { expectedRevision: revision })));
    }
    project.forEach((update) => update(view));
  };
  listen(scope, style, "change", () => { const value = style.value; return model.command((v) => gpx.setStylePreset(entry.id, value, { expectedRevision: v.revision }), render); }, report);
  model.subscribe(render, (event) => { if (event.entry?.id === entry.id && event.change?.type === "replace-data") data = null; }); model.update(render);
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
    container.classList.add("tilia-popup");
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
