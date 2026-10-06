import { extensionError, extensionErrorCodes } from "../extensions/errors.js";

function normalized(definition) {
  if (!definition || typeof definition.id !== "string" || !definition.id || typeof definition.href !== "string" || !definition.href) {
    throw extensionError(extensionErrorCodes.resourceAcquisitionFailed, "Stylesheet id and href are required");
  }
  return Object.freeze({
    id: definition.id,
    href: definition.href,
    media: definition.media || "all",
    integrity: definition.integrity || "",
    crossOrigin: definition.crossOrigin || "",
  });
}

function same(left, right) {
  return left.href === right.href && left.media === right.media
    && left.integrity === right.integrity && left.crossOrigin === right.crossOrigin;
}

export function createStylesheetManager({ document: ownerDocument, onError = () => {} }) {
  const records = new Map();

  function acquire(scope, input) {
    scope.assertAlive();
    const definition = normalized(input);
    let record = records.get(definition.id);
    if (record && !same(record.definition, definition)) {
      throw extensionError(extensionErrorCodes.resourceConflict, `Stylesheet "${definition.id}" has a conflicting definition`, { resourceId: definition.id });
    }
    if (!record) {
      if (!ownerDocument?.head) throw extensionError(extensionErrorCodes.resourceAcquisitionFailed, "No document head is available");
      const link = ownerDocument.createElement("link");
      link.rel = "stylesheet";
      link.href = definition.href;
      link.media = definition.media;
      if (definition.integrity) link.integrity = definition.integrity;
      if (definition.crossOrigin) link.crossOrigin = definition.crossOrigin;
      link.dataset.tiliaStylesheet = definition.id;
      let resolveReady;
      let rejectReady;
      let settled = false;
      const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
      // Keep ignored leases from producing an unhandled rejection while preserving
      // the original rejected promise for consumers that await `ready`.
      ready.catch(() => {});
      link.addEventListener?.("load", () => {
        if (settled) return;
        settled = true;
        resolveReady();
      }, { once: true });
      link.addEventListener?.("error", (event) => {
        if (settled) return;
        settled = true;
        const error = extensionError(extensionErrorCodes.resourceAcquisitionFailed, `Stylesheet "${definition.id}" failed to load`, {
          cause: event,
          committed: true,
          resourceId: definition.id,
        });
        link.remove?.();
        rejectReady(error);
        onError(error);
      }, { once: true });
      ownerDocument.head.appendChild(link);
      // DOM fakes and already-loaded data URLs may not dispatch load.
      if (!link.addEventListener) {
        settled = true;
        resolveReady();
      }
      record = { definition, link, ready, leases: new Set() };
      records.set(definition.id, record);
    }
    const lease = { active: true };
    record.leases.add(lease);
    const release = () => {
      if (!lease.active) return;
      lease.active = false;
      record.leases.delete(lease);
      if (record.leases.size === 0) {
        record.link.remove?.();
        if (records.get(definition.id) === record) records.delete(definition.id);
      }
    };
    scope.defer(release, { label: `stylesheet:${definition.id}`, retry: "safe" });
    return Object.freeze({ id: definition.id, ready: record.ready, release });
  }

  return Object.freeze({
    createFacade({ scope }) {
      return Object.freeze({ use: (definition) => acquire(scope, definition) });
    },
    acquire,
    has(id) { return records.has(id); },
  });
}
