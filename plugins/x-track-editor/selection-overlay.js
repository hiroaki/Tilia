import { DivIcon, Marker } from "leaflet";
const selectionIcon = new DivIcon({ className: "tilia-track-editor-selection-ring", iconSize: [18,18], iconAnchor: [9,9] });
const focusedSelectionIcon = new DivIcon({ className: "tilia-track-editor-selection-ring tilia-track-editor-selection-ring-focused", iconSize: [20,20], iconAnchor: [10,10] });
export function createSelectionOverlay({ context, scope, report = () => {} }) {
  let current;
  return {
    sync(selectedPoints, { focusedPointId = null } = {}) {
      if (!scope.alive) return;
      const old = current; current = scope.child({ label: "selection-rings" });
      void old?.dispose().catch(report);
      const child = current;
      for (const { pointId, point } of selectedPoints) {
        if (!child.alive) return;
        const marker = new Marker([point.lat,point.lon], { icon: pointId === focusedPointId ? focusedSelectionIcon : selectionIcon,
          interactive: false, keyboard: false, bubblingPointerEvents: false });
        let lease; child.defer(() => lease?.dispose(), { label: "selection-ring", retry: "safe" });
        lease = context.map.attachLayer(marker, { band: "selection" });
        if (!child.alive) lease.dispose();
      }
    },
    destroy() { const old = current; current = null; return old?.dispose(); },
  };
}
