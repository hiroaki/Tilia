import { cloneAndFreezePlainData } from "../domains/immutable.js";
import { CircleMarker, DivIcon, Marker, Polyline } from "leaflet";
import { resolveGpxStyle } from "./style.js";
import { resolveGpxTarget } from "./document.js";
import { getTrackPresentationSegments } from "./presentation-segments.js";
import { queryGpx } from "./queries.js";
const position = (p) => ({ lat: p.lat, lng: p.lon });
function routeNumberColor(background) {
  const [red, green, blue] = [1, 3, 5].map(offset => {
    const channel = Number.parseInt(background.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  const blackContrast = (luminance + 0.05) / 0.05;
  const whiteContrast = 1.05 / (luminance + 0.05);
  return blackContrast >= whiteContrast ? "#000" : "#fff";
}

class RoutePointIcon extends DivIcon {
  createIcon(old) {
    const element = super.createIcon(old);
    const { routeColor } = this.options;
    element.style.setProperty("--route-color", routeColor);
    element.style.setProperty("--route-number-color", routeNumberColor(routeColor));
    return element;
  }
}
export function createGpxRenderer(colors) {
  return Object.freeze({
    planChange: () => "replace",
    build(input) {
      const { data, preferences } = input.semanticSnapshot;
      const style = resolveGpxStyle(input.semanticSnapshot);
      const beginColor = colors?.begin(input);
      const view = { entry: { id: input.entryId }, revision: input.semanticRevision, snapshot: input.semanticSnapshot };
      const own = (layer, id, target, band = "geometry", nearest = false, group = null) => {
        input.resources.own(layer, (value) => value.remove(), { label: id, retry: "safe" });
        input.map.attachLayer(layer, { band, group });
        if (!target) return;
        const surface = input.interactions.createSurface({ id, target: layer, group });
        input.interactions.bind({ id: `${id}:select`, surface, event: "click", resolve: (event) => {
          if (!nearest) return target;
          if (!event.latlng) return target.kind === "segment" ? { kind: "track", trackIndex: target.trackIndex } : target;
          return queryGpx(view, "nearest", target, { lat: event.latlng.lat, lon: event.latlng.lng }).match?.target ?? target;
        } });
      };
      data.tracks.forEach((track, trackIndex) => {
        if (!preferences.tracksVisible || preferences.trackVisibility[trackIndex] === false) return;
        const target = { kind: "track", trackIndex };
        const drawable = beginColor?.(target, style.color);
        const color = drawable?.color ?? style.color;
        const group = input.visibility.createGroup(target);
        for (const { segmentIndex, points, gapFrom } of getTrackPresentationSegments(track, input.semanticSnapshot.derived.presentationMode)) {
          const segmentId = `track:${trackIndex}:segment:${segmentIndex}`;
          if (gapFrom) {
            const gap = new Polyline([position(gapFrom), position(points[0])], {
              ...style, color, dashArray: "1 14", lineCap: "round", interactive: false,
            });
            own(gap, `${segmentId}:gap`, null, "geometry", false, group);
            drawable?.paint.push(color => gap.setStyle({ color }));
          }
          if (points.length > 1) {
            const line = new Polyline(points.map(position), { ...style, color });
            own(line, segmentId, { kind: "segment", trackIndex, segmentIndex }, "geometry", true, group);
            drawable?.paint.push(color => line.setStyle({ color }));
          }
        }
        // Singletons stay above every line in their track, including later overlapping segments.
        track.segments.forEach(({ points }, segmentIndex) => {
          if (points.length !== 1) return;
          const pointTarget = { kind: "track-point", trackIndex, segmentIndex, pointIndex: 0 };
          const marker = new CircleMarker(position(points[0]), {
            radius: 6, fillColor: color, fillOpacity: 1,
            color: "#fff", weight: 2, opacity: 1, interactive: true,
          });
          own(marker, `track:${trackIndex}:segment:${segmentIndex}:point:0`, pointTarget, "geometry", false, group);
          drawable?.paint.push(fillColor => marker.setStyle({ fillColor }));
        });
      });
      data.routes.forEach((route, routeIndex) => {
        if (!preferences.routesVisible || preferences.routeVisibility[routeIndex] === false) return;
        const target = { kind: "route", routeIndex };
        const drawable = beginColor?.(target, style.color);
        const color = drawable?.color ?? style.color;
        if (route.points.length > 1) {
          const line = new Polyline(route.points.map(position), { ...style, color, weight: Math.max(1, style.weight - 2), dashArray: "8 6" });
          own(line, `route:${routeIndex}`, target, "geometry", true);
          drawable?.paint.push(color => line.setStyle({ color }));
        }
        route.points.forEach((point, pointIndex) => {
          const label = String(pointIndex + 1), width = Math.max(18, 10 + label.length * 6);
          const icon = routeColor => new RoutePointIcon({ className: "tilia-route-point-marker", html: label, iconSize: [width, 18], iconAnchor: [width / 2, 24], routeColor });
          const marker = new Marker(position(point), { icon: icon(color) });
          own(marker, `route:${routeIndex}:point:${pointIndex}`, { kind: "route-point", routeIndex, pointIndex }, "markers");
          drawable?.paint.push(color => marker.setIcon(icon(color)));
        });
      });
      if (preferences.waypointsVisible) data.waypoints.forEach((point, waypointIndex) => own(new Marker(position(point), { title: point.name }), `waypoint:${waypointIndex}`, { kind: "waypoint", waypointIndex }, "markers"));
      const geometry = (ref = { kind: "document" }) => {
        if (ref.revision !== undefined && ref.revision !== input.semanticRevision) return null;
        try {
          const value = resolveGpxTarget(data, ref);
          const visibleTracks = (trackIndex) => preferences.tracksVisible && preferences.trackVisibility[trackIndex] !== false
            && input.visibility.isVisible({ kind: "track", trackIndex });
          const visibleRoutes = (routeIndex) => preferences.routesVisible && preferences.routeVisibility[routeIndex] !== false;
          const trackPaths = (track, trackIndex) => visibleTracks(trackIndex) ? track.segments.map(segment => segment.points) : [];
          switch (ref.kind) {
            case "document": return [...data.tracks.flatMap(trackPaths),
              ...data.routes.filter((route, index) => visibleRoutes(index)).map(route => route.points),
              ...(preferences.waypointsVisible ? data.waypoints.map(point => [point]) : [])];
            case "track": return trackPaths(value, ref.trackIndex);
            case "segment": return visibleTracks(ref.trackIndex) ? [value.points] : [];
            case "track-point": return visibleTracks(ref.trackIndex) ? [[value]] : [];
            case "route": return visibleRoutes(ref.routeIndex) ? [value.points] : [];
            case "route-point": return visibleRoutes(ref.routeIndex) ? [[value]] : [];
            case "waypoint": return preferences.waypointsVisible ? [[value]] : [];
          }
        } catch { return null; }
      };
      return { presentation: {
        anchor(ref) { const first = geometry(ref)?.find((path) => path.length)?.[0]; return first ? position(first) : null; },
        bounds(ref) {
          const points = geometry(ref)?.flatMap((path) => path.map(position));
          if (!points?.length) return null;
          return { southWest: points.reduce((a, p) => ({ lat: Math.min(a.lat, p.lat), lng: Math.min(a.lng, p.lng) })),
            northEast: points.reduce((a, p) => ({ lat: Math.max(a.lat, p.lat), lng: Math.max(a.lng, p.lng) })) };
        },
        highlightDescriptor(ref) {
          const paths = geometry(ref); if (!paths?.length) return null;
          if (["waypoint", "track-point", "route-point"].includes(ref?.kind)) {
            return cloneAndFreezePlainData({ kind: "point", symbol: "crosshair", point: position(paths[0][0]) });
          }
          return cloneAndFreezePlainData({ kind: "geometry", lines: paths.filter((path) => path.length > 1).map((path) => path.map(position)),
            points: paths.filter((path) => path.length === 1).map((path) => position(path[0])) });
        },
      } };
    },
  });
}
