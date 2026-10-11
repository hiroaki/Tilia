import { createPaneManager } from "./panes.js";

function frozenPoint(value) {
  if (!value) return null;
  return Object.freeze({ lat: value.lat, lng: value.lng });
}

function frozenPixel(value) {
  if (!value) return null;
  return Object.freeze({ x: value.x, y: value.y });
}

function frozenMapEvent(event, fallbackType) {
  return Object.freeze({
    type: typeof event?.type === "string" ? event.type : fallbackType,
    latlng: frozenPoint(event?.latlng),
    layerPoint: frozenPixel(event?.layerPoint),
    containerPoint: frozenPixel(event?.containerPoint),
  });
}

function owned(scope, label, cleanup) {
  let active = true;
  const dispose = () => {
    if (!active) return;
    cleanup();
    active = false;
  };
  scope.defer(dispose, { label, retry: "safe" });
  return Object.freeze({ dispose });
}

export function createMapFacadeFactory({ map, panes = null }) {
  return function mapCapability({ pluginId, scope }) {
    const assert = () => scope.assertAlive();
    let fallbackPanes = null;
    const paneManager = () =>
      panes ?? (fallbackPanes ??= createPaneManager({ map, scope }));
    return Object.freeze({
      listen(type, listener) {
        assert();
        if (typeof type !== "string" || !type.trim()) {
          throw new TypeError("Map event type must be a non-empty string");
        }
        if (typeof listener !== "function") {
          throw new TypeError("Map event listener must be a function");
        }
        const eventType = type.trim();
        const guarded = scope.guard((event) =>
          listener(frozenMapEvent(event, eventType)),
        );
        const handle = owned(scope, `map-listener:${eventType}`, () =>
          map.off(eventType, guarded),
        );
        try {
          map.on(eventType, guarded);
        } catch (error) {
          handle.dispose();
          throw error;
        }
        return handle;
      },
      attachLayer(layer, options = {}) {
        assert();
        if (options.pane) {
          if (!paneManager().isOwnedBy(options.pane, scope))
            throw new TypeError("Foreign pane lease");
          if (layer.options) layer.options.pane = options.pane.name;
        } else if (options.band && layer.options)
          layer.options.pane = paneManager().getPaneName(options.band);
        const handle = owned(scope, "map-layer", () => layer.remove?.());
        try {
          layer.addTo(map);
        } catch (error) {
          handle.dispose();
          throw error;
        }
        return handle;
      },
      mountControl(control) {
        assert();
        const handle = owned(scope, "map-control", () => control.remove?.());
        try {
          control.addTo(map);
        } catch (error) {
          handle.dispose();
          throw error;
        }
        return handle;
      },
      createPane({ name, band = "derived-overlay" }) {
        assert();
        const manager = paneManager();
        const aliases = {
          "derived-overlay": "overlays",
          "domain-geometry": "geometry",
          "domain-markers": "markers",
        };
        return manager.acquire(
          pluginId,
          { name, band: aliases[band] ?? band },
          scope,
        );
      },
      fitBounds(bounds, options) {
        assert();
        map.fitBounds(bounds, options);
      },
      panTo(point, options) {
        assert();
        map.panTo(point, options);
      },
      setView(point, zoom, options) {
        assert();
        map.setView(point, zoom, options);
      },
      getViewport() {
        assert();
        const bounds = map.getBounds?.();
        return Object.freeze({
          center: frozenPoint(map.getCenter?.()),
          zoom: map.getZoom?.(),
          bounds: bounds
            ? Object.freeze({
                southWest: frozenPoint(bounds.getSouthWest()),
                northEast: frozenPoint(bounds.getNorthEast()),
              })
            : null,
        });
      },
      project(point, zoom) {
        assert();
        return frozenPixel(map.project(point, zoom));
      },
      unproject(point, zoom) {
        assert();
        return frozenPoint(map.unproject(point, zoom));
      },
      advancedLeafletMap() {
        assert();
        return map;
      },
    });
  };
}
