import { TILIA_CONTROL_PRIORITY, TILIA_UI_LAYER } from "./protocol.js";

const SURFACE_ROOT_CLASS = "tilia-ui-surface-root";

function resolveDocument(map) {
  const mapContainer = map?.getContainer?.();
  if (mapContainer?.ownerDocument) {
    return mapContainer.ownerDocument;
  }
  if (typeof document !== "undefined") {
    return document;
  }
  return null;
}

function resolvePriority(priority) {
  return Object.values(TILIA_CONTROL_PRIORITY).includes(priority)
    ? priority
    : TILIA_CONTROL_PRIORITY.normal;
}

function applySurfaceMetadata(element, surface, priority) {
  element.dataset.tiliaSurface = surface;
  element.dataset.tiliaSurfacePriority = resolvePriority(priority);
}

export function createUiSurfaceManager({ map }) {
  const mapContainer = map?.getContainer?.();
  const ownerDocument = resolveDocument(map);
  const roots = new Map();
  const items = new Map();

  if (!mapContainer || !ownerDocument) {
    return {
      mount({ element }) {
        return {
          element: element || null,
          unmount() {},
          update() {},
        };
      },
      getSurfaceRoot() {
        return null;
      },
      unmount() {},
    };
  }

  function ensureSurfaceRoot(surface) {
    const normalizedSurface = surface || TILIA_UI_LAYER.floating;
    const existing = roots.get(normalizedSurface);
    if (existing) {
      return existing;
    }

    const root = ownerDocument.createElement("div");
    root.className = `${SURFACE_ROOT_CLASS} ${SURFACE_ROOT_CLASS}-${normalizedSurface}`;
    root.dataset.tiliaSurfaceRoot = normalizedSurface;
    mapContainer.appendChild(root);
    roots.set(normalizedSurface, root);
    return root;
  }

  function mount({ id, surface = TILIA_UI_LAYER.floating, element, priority = TILIA_CONTROL_PRIORITY.normal }) {
    if (!id) {
      throw new Error("Surface items must define an id");
    }
    const HTMLElementCtor = ownerDocument.defaultView?.HTMLElement;
    const isElementNode = HTMLElementCtor
      ? element instanceof HTMLElementCtor || element?.nodeType === 1
      : element?.nodeType === 1;
    if (!isElementNode) {
      throw new Error("Surface items must provide an HTMLElement");
    }

    const root = ensureSurfaceRoot(surface);
    const current = items.get(id);
    if (current?.element === element) {
      current.priority = resolvePriority(priority);
      applySurfaceMetadata(element, surface, current.priority);
      return current.handle;
    }

    if (current) {
      current.element.remove();
      items.delete(id);
    }

    applySurfaceMetadata(element, surface, priority);
    root.appendChild(element);

    const record = {
      id,
      surface,
      element,
      priority: resolvePriority(priority),
      handle: {
        element,
        unmount() {
          if (items.get(id)?.element === element) {
            element.remove();
            items.delete(id);
          }
        },
        update(nextOptions = {}) {
          const nextSurface = nextOptions.surface || surface;
          const nextPriority = resolvePriority(nextOptions.priority || priority);
          if (nextSurface !== surface) {
            mount({
              id,
              surface: nextSurface,
              element,
              priority: nextPriority,
            });
            return;
          }
          applySurfaceMetadata(element, nextSurface, nextPriority);
          const nextRecord = items.get(id);
          if (nextRecord) {
            nextRecord.priority = nextPriority;
          }
        },
      },
    };
    items.set(id, record);
    return record.handle;
  }

  return {
    mount,
    getSurfaceRoot(surface) {
      return ensureSurfaceRoot(surface);
    },
    unmount(id) {
      items.get(id)?.handle.unmount();
    },
  };
}