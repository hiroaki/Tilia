import { DivIcon, Marker } from "leaflet";
import { PanDirectionTracker } from "./vendor/leaflet-pan-direction/src/panDirectionTracker.js";
import { createStreetViewUrl, normalizeCoordinate, effectiveViewingHeading, streetViewButtonOffset } from "./helpers.js";

function directionIcon(heading) {
  return new DivIcon({
    className: "x-street-view-direction",
    iconSize: [128, 128], iconAnchor: [64, 64],
    html: `<svg viewBox="0 0 128 128" aria-hidden="true" data-heading="${heading}"
      style="transform:rotate(${heading}deg)">
      <path d="M64 64 V12 M54 24 L64 12 L74 24" />
      <circle cx="64" cy="64" r="4" />
    </svg>`,
  });
}

export default Object.freeze({
  id: "x-street-view",
  requires: [],
  setup(context) {
    const map = context.map.advancedLeafletMap();
    const scope = context.scope.child({ label: "street-view" });
    const tracker = new PanDirectionTracker(map);
    const report = error => context.diagnostics.report(error);
    let selected = null, panel = null;

    function clearLocation() {
      const prior = selected;
      selected = null;
      if (panel) panel.hidden = true;
      if (!prior) return;
      try { prior.attachment?.dispose(); } catch (error) { report(error); }
      void prior.scope.dispose().catch(report);
    }

    function positionButton() {
      if (!selected || !panel) return;
      const anchor = map.latLngToContainerPoint(selected.coordinate);
      const { width, height } = panel.getBoundingClientRect();
      const offset = streetViewButtonOffset(tracker.getLastHeading(), width, height);
      panel.style.left = `${anchor.x + offset.x}px`;
      panel.style.top = `${anchor.y + offset.y}px`;
    }

    function updateDirection() {
      if (!selected) return;
      positionButton();
      const heading = effectiveViewingHeading(tracker.getLastHeading());
      const icon = directionIcon(heading);
      if (selected.marker) {
        selected.marker.setIcon(icon);
        return;
      }
      const marker = new Marker(selected.coordinate, {
        icon, interactive: false, keyboard: false,
        title: "Street View direction", zIndexOffset: 0,
      });
      const record = selected;
      let attachment;
      record.scope.defer(() => attachment?.dispose(), { label: "direction-marker", retry: "safe" });
      try {
        attachment = context.map.attachLayer(marker, { band: "overlays" });
        record.scope.assertAlive();
        record.marker = marker;
        record.attachment = attachment;
      } catch (error) {
        attachment?.dispose();
        throw error;
      }
    }

    function onMapClick({ latlng }) {
      if (selected) { clearLocation(); return; }
      const coordinate = normalizeCoordinate(latlng);
      if (!coordinate) return;
      selected = { coordinate, scope: scope.child({ label: "street-view-location" }), marker: null, attachment: null };
      panel.hidden = false;
      try { updateDirection(); }
      catch (error) { report(error); }
    }

    function withdraw() {
      clearLocation();
      if (panel) panel.hidden = true;
      try { tracker.disable(); } catch (error) { report(error); }
    }
    scope.signal.addEventListener("abort", withdraw, { once: true });
    scope.defer(() => scope.signal.removeEventListener("abort", withdraw), { retry: "safe" });
    scope.defer(() => tracker.reset(), { label: "tracker-state", retry: "safe" });
    scope.defer(() => tracker.disable(), { label: "tracker-listeners", retry: "safe" });
    scope.defer(clearLocation, { label: "street-view-selection", retry: "safe" });
    context.styles.use({ id: "x-street-view", href: new URL("./styles.css", import.meta.url).href });

    context.lifecycle.afterCommit(() => {
      try {
        scope.assertAlive();
        const mount = context.ui.mountSurface({
          id: "street-view", surface: "floating", ariaLabel: "Street View",
          mount({ container, scope: uiScope }) {
            container.classList.add("x-street-view-mount");
            panel = container.ownerDocument.createElement("div");
            panel.className = "x-street-view-panel";
            panel.hidden = true;
            const button = container.ownerDocument.createElement("button");
            button.type = "button";
            button.textContent = "Street View";
            button.title = "Open the selected location in a new tab";
            panel.appendChild(button);
            container.appendChild(panel);
            const capturedPanel = panel;
            if (typeof ResizeObserver !== "undefined") {
              const observer = new ResizeObserver(uiScope.guard(scope.guard(() => {
                try { positionButton(); } catch (error) { report(error); }
              })));
              uiScope.defer(() => observer.disconnect(), { label: "street-view-size", retry: "safe" });
              observer.observe(capturedPanel);
            }
            uiScope.defer(() => { capturedPanel.remove(); if (panel === capturedPanel) panel = null; }, { retry: "safe" });
            const listen = (type, callback) => {
              const guarded = uiScope.guard(scope.guard(callback));
              uiScope.defer(() => capturedPanel.removeEventListener(type, guarded), { retry: "safe" });
              capturedPanel.addEventListener(type, guarded);
            };
            // Contain input only within our panel; map input outside is untouched.
            for (const type of ["pointerdown", "mousedown", "touchstart", "click", "dblclick", "contextmenu", "wheel"])
              listen(type, event => event.stopPropagation());
            listen("click", event => {
              if (event.target !== button || !selected) return;
              // The indicator is optional; its failure must not block navigation.
              try { updateDirection(); } catch (error) { report(error); }
              try {
                const heading = tracker.getLastHeading();
                window.open(createStreetViewUrl(selected.coordinate, heading), "_blank", "noopener,noreferrer");
              } catch (error) { report(error); }
            });
          },
        });
        scope.defer(() => mount.unmount(), { label: "street-view-panel", retry: "safe" });
        // Leaflet Evented invokes listeners in registration order. Subscribe to
        // dragend only after enable() installs the tracker's finalization callback.
        tracker.enable();
        for (const [event, callback] of [["dragend", updateDirection], ["click", onMapClick],
          ["move", positionButton], ["zoom", positionButton], ["resize", positionButton]]) {
          const listener = context.map.listen(event, scope.guard(input => {
            try { callback(input); } catch (error) { report(error); }
          }));
          scope.defer(() => listener.dispose(), { label: `street-view:${event}`, retry: "safe" });
        }
        const unload = context.map.listen("unload", () => { void scope.dispose().catch(report); });
        scope.defer(() => unload.dispose(), { label: "street-view:unload", retry: "safe" });
      } catch (error) {
        void scope.dispose().catch(report);
        report(error);
      }
    });
  },
});
