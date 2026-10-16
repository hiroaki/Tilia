import { isScopeWithin } from "../ownership/scope.js";

let nextInstance = 0;
export const mapBands = Object.freeze({
  base: 200,
  geometry: 400,
  markers: 600,
  overlays: 620,
  selection: 640,
  modal: 660,
});
export function createPaneManager({ map, scope }) {
  const namespace = `tilia-${++nextInstance}`,
    bands = new Map(),
    leases = new Map(),
    managedPanes = new Map(),
    owners = new WeakMap(),
    creationOrder = [];
  let paneSequence = 0;
  const validate = (band) => {
    if (!Object.hasOwn(mapBands, band))
      throw new TypeError(`Unknown map band: ${band}`);
  };
  function create(record) {
    const indexed = map.getPane?.(record.name);
    if (indexed && managedPanes.get(record.name) !== indexed)
      throw new Error("Refusing to manage a caller-owned pane");
    // Leaflet 2.0 alpha createPane always creates an attached element and
    // replaces its named index entry. DOM removal alone leaves that entry.
    // Only an exact manager-owned indexed element may be replaced here.
    // Mark creation before calling Leaflet, so a partial throw still has cleanup ownership.
    if (!record.attempted) creationOrder.push(record);
    record.attempted = true;
    try {
      record.pane = map.createPane?.(record.name);
    } catch (error) {
      record.pane = map.getPane?.(record.name);
      if (record.pane) managedPanes.set(record.name, record.pane);
      throw error;
    }
    if (record.pane) {
      managedPanes.set(record.name, record.pane);
      record.pane.style.zIndex = String(mapBands[record.band]);
      if (record.pane.dataset) record.pane.dataset.tiliaMapBand = record.band;
    }
  }
  scope.defer(
    () => {
      const failures = [];
      for (const record of bands.values()) {
        try {
          record.pane?.remove?.();
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length)
        throw new AggregateError(failures, "Band pane cleanup failed");
    },
    { label: "map-band-panes", retry: "safe" },
  );
  return Object.freeze({
    getPaneName(band) {
      scope.assertAlive();
      validate(band);
      let record = bands.get(band);
      if (!record) {
        record = {
          name: `${namespace}-${band}`,
          band,
          pane: null,
          attempted: false,
        };
        bands.set(band, record);
        try {
          create(record);
        } catch (error) {
          record.failure = error;
          throw error;
        }
      }
      if (record.failure) throw record.failure;
      scope.assertAlive();
      return record.name;
    },
    isOwnedBy(lease, ownerScope) {
      const owner = owners.get(lease);
      return !!owner && isScopeWithin(owner, ownerScope);
    },
    acquire(owner, { name, band }, ownerScope) {
      scope.assertAlive();
      ownerScope.assertAlive();
      validate(band);
      if (
        typeof name !== "string" ||
        !name ||
        typeof owner !== "string" ||
        !owner
      )
        throw new TypeError("Invalid private pane identity");
      const key = JSON.stringify([owner, name]);
      let record = leases.get(key);
      if (record && record.band !== band)
        throw new Error("Conflicting private pane band");
      if (record?.creating)
        throw new Error("Private pane creation is in progress");
      if (
        record &&
        map.getPane?.(record.name) &&
        map.getPane(record.name) !== record.pane
      )
        throw new Error("Refusing to manage a caller-owned pane");
      const superseded = record?.retiring ? record : null;
      if (superseded) record = null;
      let acquired = false,
        released = false;
      const dispose = () => {
        if (!acquired || released) return;
        if (record.count === 1) {
          // Reentrant acquisition must get a new record/element, including
          // when removal fails. This obligation keeps only its captured pane.
          record.retiring = true;
          record.pane?.remove?.();
        }
        record.count--;
        released = true;
        // Retain the exact managed element/index identity for later reattachment.
        // This also preserves Leaflet's implicit SVG/Canvas renderer containers.
        if (!record.count) record.retiring = false;
      };
      const obligation = ownerScope.defer(dispose, {
        label: `private-pane:${key}`,
        retry: "safe",
      });
      if (!record) {
        record = {
          name: `${namespace}-private-${encodeURIComponent(key)}-${++paneSequence}`,
          band,
          count: 0,
          retiring: false,
          creating: true,
          pane: null,
          attempted: false,
        };
        leases.set(key, record);
        // Superseded records are only needed by their captured cleanup obligations.
        // Zero-lease current records retain their original position for reuse.
        if (superseded) {
          const index = creationOrder.indexOf(superseded);
          if (index !== -1) creationOrder.splice(index, 1);
        }
        record.count++;
        acquired = true;
        try {
          create(record);
          ownerScope.assertAlive();
          scope.assertAlive();
        } catch (error) {
          void obligation.dispose().catch(() => {});
          throw error;
        } finally {
          record.creating = false;
        }
      } else {
        const reattach = record.count === 0;
        record.count++;
        acquired = true;
        if (reattach) {
          record.creating = true;
          try {
            if (!record.pane) create(record);
            // A failed createPane can leave a captured element before band styling.
            record.pane.style.zIndex = String(mapBands[record.band]);
            if (record.pane.dataset) record.pane.dataset.tiliaMapBand = record.band;
            const container = map.getPane?.("mapPane");
            if (!container?.appendChild)
              throw new Error("Map pane container is unavailable");
            // Restore this record's original position, including shared band panes.
            // Only move our captured element; never move or adopt external panes.
            const index = creationOrder.indexOf(record);
            const next = creationOrder.slice(index + 1).find(candidate =>
              candidate.band === record.band &&
              candidate.pane?.parentNode === container &&
              managedPanes.get(candidate.name) === candidate.pane &&
              map.getPane?.(candidate.name) === candidate.pane);
            if (next) container.insertBefore(record.pane, next.pane);
            else container.appendChild(record.pane);
            ownerScope.assertAlive();
            scope.assertAlive();
          } catch (error) {
            void obligation.dispose().catch(() => {});
            throw error;
          } finally {
            record.creating = false;
          }
        }
      }
      const lease = Object.freeze({
        name: record.name,
        band,
        dispose: () => obligation.dispose(),
      });
      owners.set(lease, ownerScope);
      return lease;
    },
  });
}
