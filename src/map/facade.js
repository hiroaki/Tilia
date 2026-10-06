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
    active = false;
    cleanup();
  };
  scope.defer(dispose, { label, retry: "safe" });
  return Object.freeze({ dispose });
}

export function createMapFacadeFactory({ map }) {
  return function mapCapability({ pluginId, scope }) {
    const assert = () => scope.assertAlive();
    return Object.freeze({
      listen(type, listener) {
        assert();
        const guarded = scope.guard((event) => listener(frozenMapEvent(event, type)));
        map.on(type, guarded);
        return owned(scope, `map-listener:${type}`, () => map.off(type, guarded));
      },
      attachLayer(layer) {
        assert();
        layer.addTo(map);
        return owned(scope, "map-layer", () => layer.remove?.());
      },
      mountControl(control) {
        assert();
        control.addTo(map);
        return owned(scope, "map-control", () => control.remove?.());
      },
      createPane({ name, band = "derived-overlay" }) {
        assert();
        const paneName = `tilia-${pluginId}-${name}`;
        const pane = map.getPane?.(paneName) || map.createPane?.(paneName);
        if (pane) pane.dataset.tiliaMapBand = band;
        const handle = owned(scope, `map-pane:${paneName}`, () => pane?.remove?.());
        return Object.freeze({ name: paneName, dispose: handle.dispose });
      },
      fitBounds(bounds, options) { assert(); map.fitBounds(bounds, options); },
      panTo(point, options) { assert(); map.panTo(point, options); },
      setView(point, zoom, options) { assert(); map.setView(point, zoom, options); },
      getViewport() {
        assert();
        const bounds = map.getBounds?.();
        return Object.freeze({
          center: frozenPoint(map.getCenter?.()),
          zoom: map.getZoom?.(),
          bounds: bounds ? Object.freeze({ southWest: frozenPoint(bounds.getSouthWest()), northEast: frozenPoint(bounds.getNorthEast()) }) : null,
        });
      },
      project(point, zoom) { assert(); return frozenPixel(map.project(point, zoom)); },
      unproject(point, zoom) { assert(); return frozenPoint(map.unproject(point, zoom)); },
      advancedLeafletMap() { assert(); return map; },
    });
  };
}
