import { DivIcon, LayerGroup, Marker } from "leaflet";

const selectionIcon = new DivIcon({
  className: "tilia-track-editor-selection-ring",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const focusedSelectionIcon = new DivIcon({
  className: "tilia-track-editor-selection-ring tilia-track-editor-selection-ring-focused",
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

export function createSelectionOverlay(map) {
  const group = new LayerGroup().addTo(map);

  return {
    sync(selectedPoints, { focusedPointId = null } = {}) {
      group.clearLayers();
      for (const { pointId, point } of selectedPoints) {
        new Marker([point.lat, point.lon], {
          icon: pointId === focusedPointId ? focusedSelectionIcon : selectionIcon,
          interactive: false,
          keyboard: false,
          bubblingPointerEvents: false,
          zIndexOffset: 1000,
        }).addTo(group);
      }
    },
    destroy() {
      group.clearLayers();
      group.remove();
    },
  };
}
