import { DivIcon, LayerGroup, Marker } from "leaflet";
import { gpxDomainKey } from "../../src/index.js";
import { buildSeries, placeMarkers, visibleMarkers, formatDistance, SPACING_PIXELS, DEFAULT_MAX_MARKERS, MAX_MARKERS_LIMIT } from "./placement.js";

export default Object.freeze({
  id: "x-distance-markers",
  requires: ["tilia-gpx-domain"],
  setup(context, { spacing = "medium", maxMarkers = DEFAULT_MAX_MARKERS } = {}) {
    if (typeof spacing !== "string" || !Object.hasOwn(SPACING_PIXELS, spacing)) {
      throw new TypeError("Distance marker spacing must be small, medium, or large");
    }
    if (!Number.isInteger(maxMarkers) || maxMarkers < 1 || maxMarkers > MAX_MARKERS_LIMIT) {
      throw new TypeError(`maxMarkers must be an integer from 1 to ${MAX_MARKERS_LIMIT}`);
    }
    const owner = context.scope;
    const gpx = context.domains.require(gpxDomainKey);
    const report = error => context.diagnostics.report(error);
    // One owned attachment, regardless of the number of selection/viewport changes.
    const group = new LayerGroup();
    // Keep labels above the selection highlight and below Leaflet popups.
    context.map.attachLayer(group, { band: "modal" });
    context.styles.use({ id: "x-distance-markers", href: new URL("./styles.css", import.meta.url).href });
    let state = null, refreshing = false, again = false;

    function close() {
      const previous = state;
      state = null;
      group.clearLayers();
      if (previous) void previous.scope.dispose().catch(report);
    }
    function selectedTrack() {
      const selection = context.selection.getCurrent();
      if (selection?.domain !== gpxDomainKey || !["track", "segment", "track-point"].includes(selection.ref.kind)
          || !context.entries.get(selection.entryId)) return null;
      const { entryId, ref } = selection;
      const view = gpx.get(entryId), preferences = view.snapshot.preferences;
      if (ref.revision !== view.revision || !view.entry.visible || !preferences.tracksVisible || preferences.trackVisibility[ref.trackIndex] === false
          || context.rendering.getSuppressionSnapshot().some(s => s.entryId === entryId && s.domain === gpxDomainKey
            && s.ref.revision === view.revision && s.ref.trackIndex === ref.trackIndex)) return null;
      return { entryId, ref, trackIndex: ref.trackIndex, view };
    }
    function current(record, ref) {
      if (!owner.alive || !record.scope.alive || state !== record) return false;
      const selected = selectedTrack();
      // The selection store keeps the ref immutable. Recheck its identity and
      // eligibility without resolving the selection again for each marker.
      return selected?.entryId === record.entryId && selected.ref === ref;
    }
    function refreshOnce() {
      const selected = selectedTrack();
      if (!selected || !gpx.selection.resolve(selected.entryId, selected.ref)) { close(); return; }
      const { entryId, ref, trackIndex, view } = selected;
      if (!state || state.entryId !== entryId || state.trackIndex !== trackIndex || state.revision !== view.revision) {
        close();
        const scope = owner.child({ label: "distance-marker-track" });
        const record = { entryId, trackIndex, revision: view.revision, scope, series: null, viewportKey: null, markerKey: null };
        state = record;
        const withdraw = () => { if (state === record) { state = null; group.clearLayers(); } };
        scope.signal.addEventListener("abort", withdraw, { once: true });
        scope.defer(() => scope.signal.removeEventListener("abort", withdraw), { retry: "safe" });
        context.entries.bindPresentationLifetime(entryId, { scope });
        const samples = gpx.getElevationProfile(entryId, { target: { kind: "track", trackIndex } }).profiles[0].samples;
        record.series = buildSeries(view.snapshot.data.tracks[trackIndex], samples, context.map.project);
      }
      const record = state;
      if (!record || !current(record, ref)) return;
      const { zoom, bounds } = context.map.getViewport();
      // Leaflet can emit both zoomend and moveend for the same viewport.
      const viewportKey = JSON.stringify([zoom, bounds]);
      if (record.viewportKey === viewportKey) return;
      let clip = null;
      if (bounds) {
        const sw = context.map.project(bounds.southWest, 0), ne = context.map.project(bounds.northEast, 0);
        clip = { left: sw.x, right: ne.x, top: ne.y, bottom: sw.y };
      }
      const markers = visibleMarkers(placeMarkers(record.series, zoom, SPACING_PIXELS[spacing], maxMarkers), zoom, clip);
      const key = JSON.stringify(markers);
      if (record.markerKey === key) {
        record.viewportKey = viewportKey;
        return;
      }
      // A reentrant selection or suppression change can interrupt attachment.
      record.markerKey = null;
      record.viewportKey = null;
      group.clearLayers();
      for (const point of markers) {
        if (!current(record, ref)) { again = owner.alive; return; }
        const marker = new Marker(context.map.unproject(point, 0), {
          pane: group.options.pane, interactive: false, keyboard: false,
          icon: new DivIcon({ className: "x-distance-marker", iconSize: [68, 18], iconAnchor: [34, 9],
            html: `<span aria-hidden="true">${formatDistance(point.distance)}</span>` }),
        });
        group.addLayer(marker);
        // Attachment can synchronously delete data, change selection or suppress rendering.
        if (!current(record, ref)) { group.removeLayer(marker); again = owner.alive; return; }
      }
      record.markerKey = key;
      record.viewportKey = viewportKey;
    }
    const refresh = owner.guard(() => {
      if (refreshing) { again = true; return; }
      refreshing = true;
      try { do { again = false; refreshOnce(); } while (again && owner.alive); }
      catch (error) { close(); report(error); }
      finally { refreshing = false; }
    });
    owner.signal.addEventListener("abort", close, { once: true });
    owner.defer(() => { owner.signal.removeEventListener("abort", close); close(); }, { retry: "safe" });
    context.selection.subscribe(refresh);
    context.entries.subscribe(refresh, { emitCurrent: false });
    context.rendering.subscribeSuppression(refresh, { emitCurrent: false });
    for (const event of ["zoomend", "moveend", "resize"]) context.map.listen(event, refresh);
    refresh();
  },
});
