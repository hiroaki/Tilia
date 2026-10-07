import { cloneAndFreezePlainData } from "../domains/immutable.js";
import { CircleMarker, DivIcon, Marker, Polyline } from "leaflet";
import { TRACK_STYLE_PRESETS } from "../map/track-style-presets.js";
import { gpxTargetPaths, queryGpx } from "./queries.js";
const position = (p) => ({ lat: p.lat, lng: p.lon });
class RoutePointIcon extends DivIcon {
  createIcon(old) { const element = super.createIcon(old); element.style.setProperty("--route-color", this.options.routeColor); return element; }
}
export function createGpxRenderer() {
  return Object.freeze({
    planChange: () => "replace",
    build(input) {
      const { data, preferences } = input.semanticSnapshot;
      const style = TRACK_STYLE_PRESETS.find((p) => p.id === preferences.stylePresetId) ?? TRACK_STYLE_PRESETS[0];
      const view = { entry: { id: input.entryId }, revision: input.semanticRevision, snapshot: input.semanticSnapshot };
      const own = (layer, id, target, band = "geometry", nearest = false) => {
        input.resources.own(layer, (value) => value.remove(), { label: id, retry: "safe" });
        input.map.attachLayer(layer, { band });
        const surface = input.interactions.createSurface({ id, target: layer });
        input.interactions.bind({ id: `${id}:select`, surface, event: "click", resolve: (event) => {
          if (!nearest) return target;
          if (!event.latlng) return target;
          return queryGpx(view, "nearest", target, { lat: event.latlng.lat, lon: event.latlng.lng }).match?.target ?? target;
        } });
      };
      data.tracks.forEach((track, trackIndex) => {
        if (!preferences.tracksVisible || preferences.trackVisibility[trackIndex] === false) return;
        const target = { kind: "track", trackIndex };
        const points = gpxTargetPaths(data, target)[0].points.map(({ point }) => position(point));
        if (points.length > 1) own(new Polyline(points, style), `track:${trackIndex}`, target, "geometry", true);
        else if (points.length === 1) own(new CircleMarker(points[0], { ...style, radius: 5 }), `track:${trackIndex}`, target, "geometry", true);
      });
      data.routes.forEach((route, routeIndex) => {
        if (!preferences.routesVisible) return;
        const target = { kind: "route", routeIndex };
        if (route.points.length > 1) own(new Polyline(route.points.map(position), { ...style, weight: Math.max(1, style.weight - 2), dashArray: "8 6" }), `route:${routeIndex}`, target, "geometry", true);
        route.points.forEach((point, pointIndex) => {
          const label = String(pointIndex + 1), width = Math.max(18, 10 + label.length * 6);
          const icon = new RoutePointIcon({ className: "tilia-route-point-marker", html: label, iconSize: [width, 18], iconAnchor: [width / 2, 24], routeColor: style.color });
          own(new Marker(position(point), { icon }), `route:${routeIndex}:point:${pointIndex}`, { kind: "route-point", routeIndex, pointIndex }, "markers");
        });
      });
      if (preferences.waypointsVisible) data.waypoints.forEach((point, waypointIndex) => own(new Marker(position(point), { title: point.name }), `waypoint:${waypointIndex}`, { kind: "waypoint", waypointIndex }, "markers"));
      const geometry = (ref = { kind: "document" }) => {
        if (ref.revision !== undefined && ref.revision !== input.semanticRevision) return null;
        try {
          return gpxTargetPaths(data, ref).filter(({ target }) => {
            if (["track", "segment", "track-point"].includes(target.kind)) return preferences.tracksVisible && preferences.trackVisibility[target.trackIndex] !== false;
            if (["route", "route-point"].includes(target.kind)) return preferences.routesVisible;
            return preferences.waypointsVisible;
          });
        } catch { return null; }
      };
      return { presentation: {
        anchor(ref) { const first = geometry(ref)?.find((path) => path.points.length)?.points[0]; return first ? position(first.point) : null; },
        bounds(ref) {
          const points = geometry(ref)?.flatMap((path) => path.points.map(({ point }) => position(point)));
          if (!points?.length) return null;
          return { southWest: points.reduce((a, p) => ({ lat: Math.min(a.lat, p.lat), lng: Math.min(a.lng, p.lng) })),
            northEast: points.reduce((a, p) => ({ lat: Math.max(a.lat, p.lat), lng: Math.max(a.lng, p.lng) })) };
        },
        highlightDescriptor(ref) {
          const paths = geometry(ref); if (!paths) return null;
          return cloneAndFreezePlainData({ kind: "geometry", lines: paths.filter((path) => path.points.length > 1).map((path) => path.points.map(({ point }) => position(point))),
            points: paths.filter((path) => path.points.length === 1).map((path) => position(path.points[0].point)) });
        },
      } };
    },
  });
}
