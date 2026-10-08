import { DivIcon, Marker } from "leaflet";
import { getTrackModePointDetails } from "../../src/gpx/interpretation.js";
import { gpxDomainKey } from "../../src/domains/index.js";

const defaultIntervalDefinition = Object.freeze({
  mapping: {
    5: 400000,
    6: 300000,
    7: 200000,
    8: 100000,
    9: 100000,
    10: 50000,
    11: 50000,
    12: 20000,
    13: 20000,
    14: 10000,
    15: 10000,
    16: 2000,
    17: 2000,
    18: 1000,
    19: 1000,
  },
  minZoom: 5,
  maxZoom: 20,
  maxNumberOfSigns: 100,
  minIntervalMeters: 100,
});

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function resolveInterval(fullLengthMeters, zoom, definition) {
  const roundedZoom = Math.trunc(Number(zoom) || definition.minZoom);
  let interval = roundedZoom < definition.maxZoom
    ? (definition.mapping[roundedZoom] || definition.minIntervalMeters)
    : definition.minIntervalMeters;
  const minInterval = fullLengthMeters / definition.maxNumberOfSigns;

  if (interval <= minInterval) {
    for (let candidateZoom = roundedZoom - 1; candidateZoom >= definition.minZoom && interval <= minInterval; candidateZoom -= 1) {
      interval = candidateZoom < definition.maxZoom
        ? (definition.mapping[candidateZoom] || definition.minIntervalMeters)
        : definition.minIntervalMeters;
    }
  }

  return Math.max(interval, definition.minIntervalMeters);
}

function buildMilestones(trackPointDetails, intervalMeters) {
  const milestones = [];
  let nextCheckpoint = intervalMeters;

  for (let index = 1; index < trackPointDetails.length; index += 1) {
    const point = trackPointDetails[index];
    const distanceMeters = Number(point?.distanceMeters);
    if (!Number.isFinite(distanceMeters)) {
      continue;
    }

    while (nextCheckpoint <= distanceMeters) {
      milestones.push({
        index,
        lat: point.lat,
        lon: point.lon,
        distanceMeters: nextCheckpoint,
      });
      nextCheckpoint += intervalMeters;
    }
  }

  return milestones;
}

function formatMilestoneLabel(distanceMeters) {
  if (distanceMeters >= 1000) {
    const kilometers = distanceMeters / 1000;
    const digits = Number.isInteger(kilometers) ? 0 : 1;
    return `${kilometers.toFixed(digits)} km`;
  }
  return `${Math.round(distanceMeters)} m`;
}

function createMilestoneMarker(milestone, options) {
  const label = escapeHtml(options.formatLabel(milestone.distanceMeters));
  return new Marker([milestone.lat, milestone.lon], {
    interactive: false,
    keyboard: false,
    icon: new DivIcon({
      className: "tilia-milestone",
      html: `<span style="display:inline-block;padding:1px 5px;border:1px solid #0f766e33;border-radius:999px;background:#fffcf7f0;color:#134e4a;font:600 11px/1.4 'Hiragino Sans','Yu Gothic',sans-serif;white-space:nowrap;box-shadow:0 2px 8px #00000014;">${label}</span>`,
    }),
  });
}

export const milestonePlugin = {
  id: "x-milestone",
  requires: ["tilia-gpx-domain"],
  setup(context, options = {}) {
    const owner = context.scope;
    const gpx = context.domains.require(gpxDomainKey);
    const definition = options.intervalDefinition ?? defaultIntervalDefinition;
    if (!definition || !Number.isInteger(definition.minZoom) || !Number.isInteger(definition.maxZoom)
      || definition.maxZoom <= definition.minZoom || !Number.isInteger(definition.maxNumberOfSigns)
      || definition.maxNumberOfSigns < 1 || !Number.isFinite(definition.minIntervalMeters) || definition.minIntervalMeters <= 0
      || !definition.mapping || typeof definition.mapping !== "object" || Array.isArray(definition.mapping)
      || Object.values(definition.mapping).some(value => !Number.isFinite(value) || value <= 0)) {
      throw new TypeError("Invalid Milestone interval definition");
    }
    const config = { intervalDefinition: Object.freeze({ ...definition, mapping: Object.freeze({ ...definition.mapping }) }),
      formatLabel: options.formatLabel ?? formatMilestoneLabel };
    if (typeof config.formatLabel !== "function") throw new TypeError("Milestone formatLabel must be a function");
    const report = error => { try { context.diagnostics?.report(error); } catch {} };
    const states = new Map();
    const caches = new Map();
    owner.defer(() => { states.clear(); caches.clear(); }, { retry: "safe" });
    let refreshing = false, refreshAgain = false;

    function close(state) {
      states.delete(state.id);
      void state.scope.dispose().catch(report);
    }
    function visible(view, trackIndex) {
      const preferences = view.snapshot.preferences;
      return view.entry.visible && preferences.tracksVisible && preferences.trackVisibility[trackIndex] !== false
        && !context.rendering.getSuppressionSnapshot().some(value => value.entryId === view.entry.id
          && value.domain === gpxDomainKey && value.ref.revision === view.revision && value.ref.trackIndex === trackIndex);
    }
    function refreshOnce() {
      const zoom = context.map.getViewport().zoom;
      const entries = context.entries.list().filter(entry => entry.domain === gpxDomainKey);
      for (const id of [...caches.keys()]) if (!entries.some(entry => entry.id === id)) caches.delete(id);
      for (const state of [...states.values()]) if (!entries.some(entry => entry.id === state.id)) close(state);
      for (const entry of entries) {
        if (!owner.alive || !context.entries.get(entry.id)) continue;
        const view = gpx.get(entry.id);
        let cache = caches.get(entry.id);
        if (!cache || cache.revision !== view.revision) {
          cache = { revision: view.revision, tracks: new Map() }; caches.set(entry.id, cache);
        }
        const desired = view.snapshot.data.tracks.flatMap((track, trackIndex) => {
          if (!visible(view, trackIndex)) return [];
          let trackCache = cache.tracks.get(trackIndex);
          if (!trackCache) {
            trackCache = { distance: gpx.getDistance(entry.id, { target: { kind: "track", trackIndex } }).totalMeters,
              details: getTrackModePointDetails(track, trackIndex), intervals: new Map() };
            cache.tracks.set(trackIndex, trackCache);
          }
          const distance = trackCache.distance;
          if (!Number.isFinite(distance) || distance < config.intervalDefinition.minIntervalMeters) return [];
          return [{ trackIndex, interval: resolveInterval(distance, zoom, config.intervalDefinition) }];
        });
        const key = JSON.stringify([view.revision, desired]);
        const old = states.get(entry.id);
        if (old?.key === key && old.scope.alive) continue;
        if (old) close(old);
        if (!desired.length || !context.entries.get(entry.id)) continue;
        const scope = owner.child({ label: `milestone-entry:${entry.id}` });
        const state = { id: entry.id, key, scope, attachments: [] };
        states.set(entry.id, state);
        // Physical withdrawal is synchronous. Disposal records separately retain
        // failed attempts and join cleanup through the generic entry binding.
        const withdraw = () => {
          if (states.get(state.id) === state) states.delete(state.id);
          if (!owner.alive || !context.entries.get(state.id)) caches.delete(state.id);
          for (const attachment of state.attachments) {
            try { attachment.dispose(); } catch (error) { report(error); }
          }
        };
        scope.signal.addEventListener("abort", withdraw, { once: true });
        scope.defer(() => scope.signal.removeEventListener("abort", withdraw), { retry: "safe" });
        try {
          context.entries.bindPresentationLifetime(entry.id, { scope });
          for (const { trackIndex, interval } of desired) {
            const trackCache = cache.tracks.get(trackIndex);
            let milestones = trackCache.intervals.get(interval);
            if (!milestones) { milestones = buildMilestones(trackCache.details, interval); trackCache.intervals.set(interval, milestones); }
            for (const milestone of milestones) {
              if (!scope.alive || !context.entries.get(entry.id)) break;
              const admitted = gpx.get(entry.id);
              if (admitted.revision !== view.revision || !visible(admitted, trackIndex)) break;
              let attachment = null;
              scope.defer(() => attachment?.dispose(), { label: "milestone-marker", retry: "safe" });
              const marker = createMilestoneMarker(milestone, config);
              if (!scope.alive || !owner.alive) break;
              attachment = context.map.attachLayer(marker, { band: "overlays" });
              state.attachments.push(attachment);
              // Leaflet attachment may invoke callbacks that delete the source,
              // uninstall this plugin, replace data or acquire suppression.
              const current = context.entries.get(entry.id) ? gpx.get(entry.id) : null;
              if (!scope.alive || !current || current.revision !== view.revision || !visible(current, trackIndex)) {
                attachment.dispose(); refreshAgain = owner.alive;
              }
            }
          }
        } catch (error) { close(state); report(error); }
      }
    }
    const refresh = owner.guard(() => {
      if (refreshing) { refreshAgain = true; return; }
      refreshing = true;
      try {
        do { refreshAgain = false; refreshOnce(); } while (refreshAgain && owner.alive);
      } finally { refreshing = false; }
    });
    context.entries.subscribe(refresh, { emitCurrent: false });
    context.rendering.subscribeSuppression(refresh, { emitCurrent: false });
    context.map.listen("zoomend", refresh);
    refresh();
  },
};

export default milestonePlugin;
