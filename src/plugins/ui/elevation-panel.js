import { CircleMarker } from "leaflet";
import { gpxDomainKey } from "../../domains/keys.js";
import { elevationLayout, nearestElevationSample } from "../../gpx/elevation-layout.js";
import { panelServiceKey } from "../contracts/panel.js";
import { listen, node, reportError } from "../../ui/scoped-dom.js";
import { registerLauncher } from "../../ui/toolbar-launcher.js";
export default Object.freeze({ id: "tilia-elevation", requires: ["tilia-panel", "tilia-toolbar", "tilia-gpx-domain"], setup(context, options = {}) {
    context.styles.use({ id: "tilia-elevation-ui", href: new URL("./elevation.css", import.meta.url).href });
  const gpx = context.domains.require(gpxDomainKey), panel = context.services.require(panelServiceKey), report = (e) => reportError(context, e), handles = new Set();
  let activeId;
  registerLauncher(context, options, { kind: "action", label: "Elevation", iconText: "E", className: "tilia-elevation-control", activate() {
    if (panel.isOpen("elevation")) return panel.close("elevation");
    handles.add(panel.open({ id: "elevation", title: "Elevation", layout: "bottom", mount({ container, scope }) {
      container.classList.add("tilia-elevation-panel-content");
      let session, hoverScope, layout, revision, chart, guide, guideLine, keyboardIndex = 0;
      const clearHover = () => { const old = hoverScope; hoverScope = null; void old?.dispose().catch(report); if (guide) guide.hidden = true; if (guideLine) guideLine.hidden = true; };
      const showGuide = (sample) => {
        guide.hidden = guideLine.hidden = false;
        guide.style.left = guideLine.style.left = `${sample.x / layout.width * 100}%`;
        guide.style.top = `${sample.y / layout.height * 100}%`;
      };
      const chooseEntry = () => {
        const selected = context.selection.getCurrent(), entries = context.entries.list();
        if (selected?.domain === gpxDomainKey && context.entries.get(selected.entryId)) activeId = selected.entryId;
        else if (!activeId || !context.entries.get(activeId)) activeId = entries.find((e) => e.domain === gpxDomainKey && gpx.get(e.id).snapshot.data.tracks.length)?.id;
        return activeId && context.entries.get(activeId) ? gpx.get(activeId) : null;
      };
      const current = () => {
        if (!scope.alive || !session?.alive) return null;
        if (!activeId || !context.entries.get(activeId)) { clearHover(); render(); return null; }
        const view = gpx.get(activeId); if (view.revision !== revision) { clearHover(); render(); return null; } return view;
      };
      const resolve = (view, sample) => {
        const preferences = view.snapshot.preferences;
        if (!view.entry.visible || !preferences.tracksVisible || preferences.trackVisibility[sample.locator.trackIndex] === false) return null;
        const handle = context.presentation.resolve(view.entry.id, sample.locator);
        return handle?.isCurrent() && handle.anchor ? handle : null;
      };
      const selectSample = (sample) => {
        const view = current(); if (!view || !sample) return;
        const candidate = gpx.selection.createCandidate(view.entry.id, sample.locator); context.selection.request(candidate);
        if (!scope.alive || !context.entries.get(view.entry.id)) return;
        const latest = gpx.get(view.entry.id); if (latest.revision !== view.revision) return;
        const handle = resolve(latest, sample); if (handle?.isCurrent()) context.map.panTo(handle.anchor);
      };
      const hover = (sample) => {
        clearHover(); const view = current(); if (!sample || !view) return;
        showGuide(sample);
        const handle = resolve(view, sample); if (!handle) return;
        const child = session.child({ label: "elevation-hover" }); hoverScope = child;
        const detach = () => { if (hoverScope === child) clearHover(); };
        child.defer(() => handle.signal.removeEventListener("abort", detach), { retry: "safe" }); handle.signal.addEventListener("abort", detach, { once: true });
        if (!handle.isCurrent()) { detach(); return; }
        const marker = new CircleMarker(handle.anchor, { radius: 7, color: "#0f766e", fillOpacity: 0.8, interactive: false });
        // Attachment can synchronously trigger a new chart; reserve cleanup first.
        let lease; child.defer(() => lease?.dispose(), { retry: "safe" });
        lease = context.map.attachLayer(marker, { band: "overlays" });
      };
      const render = () => {
        if (!scope.alive) return;
        clearHover(); const old = session; session = scope.child({ label: "elevation-chart" }); void old?.dispose().catch(report); container.replaceChildren();
        const view = chooseEntry(); if (!view) { node(container, "p", "tilia-elevation-empty", "No GPX tracks"); layout = null; return; }
        revision = view.revision;
        layout = elevationLayout(gpx.getElevationProfile(view.entry.id).profiles, { paddingX: 3, paddingTop: 8, paddingBottom: 20 });
        if (!layout.points.length) {
          node(container, "span", "tilia-elevation-name tilia-elevation-chart-label", `${view.snapshot.data.name}${view.entry.visible ? "" : " (hidden)"}`);
          node(container, "p", "tilia-elevation-empty", view.snapshot.data.tracks.length ? "No elevation data" : "No GPX tracks"); return;
        }
        const wrap = node(container, "div", "tilia-elevation-chart-wrap");
        const surface = node(wrap, "div", "tilia-elevation-chart-surface");
        const svg = (tag, attrs) => { const n = container.ownerDocument.createElementNS?.("http://www.w3.org/2000/svg", tag) ?? container.ownerDocument.createElement(tag); for (const [key, value] of Object.entries(attrs)) n.setAttribute(key, value); return n; };
        chart = svg("svg", { class: "tilia-elevation-chart", viewBox: `0 0 ${layout.width} ${layout.height}`, preserveAspectRatio: "none", "aria-label": "Elevation profile", role: "img", tabindex: "0" }); surface.appendChild(chart);
        chart.appendChild(svg("line", { x1: 3, x2: layout.width - 3, y1: layout.height - 20, y2: layout.height - 20, stroke: "#d6d3d1", "stroke-width": "1" }));
        for (const stroke of layout.strokes) chart.appendChild(svg("polyline", { points: `${stroke.from.x},${stroke.from.y} ${stroke.to.x},${stroke.to.y}`, fill: "none", stroke: "#0f766e", "stroke-width": "2", "stroke-linejoin": "round", "stroke-linecap": "round", "stroke-dasharray": stroke.inferred ? "4 3" : "none", "data-track-index": stroke.trackIndex }));
        // Connected samples are already painted by the profile. Painting a dot
        // for each one makes dense tracks look solid when the SVG stretches.
        const connected = new Set(layout.strokes.flatMap((stroke) => [stroke.from, stroke.to]));
        for (const point of layout.points) if (!connected.has(point)) chart.appendChild(svg("path", {
          d: `M ${point.x},${point.y} l 0,0`, stroke: "#0f766e", "stroke-width": "5",
          "stroke-linecap": "round", "vector-effect": "non-scaling-stroke", "data-track-index": point.trackIndex,
        }));
        const overlay = node(surface, "div", "tilia-elevation-guide-overlay");
        guideLine = node(overlay, "div", "tilia-elevation-guide-line"); guideLine.hidden = true;
        guide = node(overlay, "div", "tilia-elevation-guide-marker"); guide.hidden = true;
        const footer = node(wrap, "div", "tilia-elevation-chart-footer");
        node(footer, "span", "tilia-elevation-name tilia-elevation-chart-label", `${view.snapshot.data.name}${view.entry.visible ? "" : " (hidden)"}`);
        const distance = layout.distanceMeters >= 1000 ? `${(layout.distanceMeters / 1000).toFixed(1)} km` : `${Math.round(layout.distanceMeters)} m`;
        const summary = node(footer, "span", "tilia-elevation-summary tilia-elevation-chart-label tilia-elevation-chart-label-end", `${distance} / ${Math.round(layout.minimum)}–${Math.round(layout.maximum)} m / ascent ${Math.round(layout.ascent)} m`);
        summary.setAttribute("aria-live", "polite");
        const at = (event) => {
          // Use the SVG's actual screen transform, including its border and scale.
          const matrix = chart.getScreenCTM?.();
          if (matrix && chart.createSVGPoint) {
            const point = chart.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
            return nearestElevationSample(layout, point.matrixTransform(matrix.inverse()).x);
          }
          const rect = chart.getBoundingClientRect?.(); if (!rect?.width) return null;
          return nearestElevationSample(layout, (event.clientX - rect.left) / rect.width * layout.width);
        };
        listen(session, chart, "pointermove", (event) => hover(at(event)), report); listen(session, chart, "pointerleave", clearHover, report);
        listen(session, chart, "click", (event) => selectSample(at(event)), report);
        keyboardIndex = Math.min(keyboardIndex, layout.points.length - 1);
        listen(session, chart, "keydown", (event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); keyboardIndex = Math.max(0, Math.min(layout.points.length - 1, keyboardIndex + (event.key === "ArrowRight" ? 1 : -1))); hover(layout.points[keyboardIndex]); }
          else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectSample(layout.points[keyboardIndex]); }
        }, report);
        const selected = context.selection.getCurrent();
        if (selected?.entryId === view.entry.id && selected.ref.kind === "track-point") {
          const point = layout.points.find((p) => ["trackIndex", "segmentIndex", "pointIndex"].every((key) => p.locator[key] === selected.ref[key]));
          if (point) showGuide(point);
        }
      };
      const subscriptions = [context.entries.subscribe(render, { emitCurrent: false }), context.selection.subscribe(render), context.rendering.subscribe(clearHover, { emitCurrent: false })];
      scope.defer(() => subscriptions.forEach((s) => s.unsubscribe()), { retry: "safe" }); render();
    } }));
  } });
  context.scope.defer(async () => { for (const handle of handles) await handle.dispose(); }, { retry: "safe" });
} });
