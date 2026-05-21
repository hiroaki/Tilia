import { TILIA_CONTROL_PRIORITY, TILIA_UI_LAYER } from "./protocol.js";

const SURFACE_ROOT_CLASS = "tilia-ui-surface-root";
const RESERVED_RIGHT_VAR = "--tilia-reserved-right";
const RESERVED_BOTTOM_VAR = "--tilia-reserved-bottom";
const PANEL_OFFSET_RIGHT_VAR = "--tilia-panel-offset-right";
const PANEL_OFFSET_BOTTOM_VAR = "--tilia-panel-offset-bottom";

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

function measureInset(element, dimension) {
  const rect = element?.getBoundingClientRect?.();
  if (dimension === "width") {
    return Math.ceil(rect?.width || element?.offsetWidth || element?.clientWidth || 0);
  }
  return Math.ceil(rect?.height || element?.offsetHeight || element?.clientHeight || 0);
}

function setStyleProperty(style, name, value) {
  if (typeof style?.setProperty === "function") {
    style.setProperty(name, value);
    return;
  }
  style[name] = value;
}

function removeStyleProperty(style, name) {
  if (typeof style?.removeProperty === "function") {
    style.removeProperty(name);
    return;
  }
  delete style[name];
}

function measureNode(node, dimension) {
  const rect = node?.getBoundingClientRect?.();
  if (dimension === "width") {
    return Math.ceil(rect?.width || node?.offsetWidth || node?.clientWidth || 0);
  }
  return Math.ceil(rect?.height || node?.offsetHeight || node?.clientHeight || 0);
}

function queryCornerNodes(mapContainer, selectors) {
  if (typeof mapContainer?.querySelectorAll !== "function") {
    return [];
  }

  return selectors.flatMap((selector) => Array.from(mapContainer.querySelectorAll(selector) || []));
}

function queryPriorityControls(container) {
  if (typeof container?.querySelectorAll !== "function") {
    return [];
  }

  return Array.from(container.querySelectorAll(".tilia-map-control") || []);
}

function getCornerPriority(cornerNodes) {
  const priorities = cornerNodes.flatMap((cornerNode) => queryPriorityControls(cornerNode).map((control) => control.dataset?.tiliaPriority));
  if (priorities.includes(TILIA_CONTROL_PRIORITY.high)) {
    return TILIA_CONTROL_PRIORITY.high;
  }
  if (priorities.includes(TILIA_CONTROL_PRIORITY.normal)) {
    return TILIA_CONTROL_PRIORITY.normal;
  }
  if (priorities.includes(TILIA_CONTROL_PRIORITY.low)) {
    return TILIA_CONTROL_PRIORITY.low;
  }
  return null;
}

function getCornerExtent(cornerNodes, dimension) {
  return cornerNodes.reduce((largest, node) => Math.max(largest, measureNode(node, dimension)), 0);
}

export function createUiSurfaceManager({ map }) {
  const mapContainer = map?.getContainer?.();
  const ownerDocument = resolveDocument(map);
  const roots = new Map();
  const items = new Map();
  let panelObserver = null;
  let panelState = {
    active: false,
    layout: "side",
    element: null,
  };

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
      setPanelState() {},
      unmount() {},
    };
  }

  function disconnectPanelObserver() {
    panelObserver?.disconnect?.();
    panelObserver = null;
  }

  function applyPanelState() {
    if (!panelState.active || !panelState.element) {
      delete mapContainer.dataset.tiliaPanelLayout;
      removeStyleProperty(mapContainer.style, RESERVED_RIGHT_VAR);
      removeStyleProperty(mapContainer.style, RESERVED_BOTTOM_VAR);
      removeStyleProperty(mapContainer.style, PANEL_OFFSET_RIGHT_VAR);
      removeStyleProperty(mapContainer.style, PANEL_OFFSET_BOTTOM_VAR);
      return;
    }

    mapContainer.dataset.tiliaPanelLayout = panelState.layout;

    if (panelState.layout === "bottom") {
      const conflictingCorners = queryCornerNodes(mapContainer, [
        ".leaflet-bottom.leaflet-left",
        ".leaflet-bottom.leaflet-right",
      ]);
      const panelInset = `${measureInset(panelState.element, "height") + 24}px`;
      const controlInset = `${getCornerExtent(conflictingCorners, "height") + 24}px`;
      if (getCornerPriority(conflictingCorners) === TILIA_CONTROL_PRIORITY.high) {
        setStyleProperty(mapContainer.style, PANEL_OFFSET_BOTTOM_VAR, controlInset);
        removeStyleProperty(mapContainer.style, RESERVED_BOTTOM_VAR);
      } else {
        setStyleProperty(mapContainer.style, RESERVED_BOTTOM_VAR, panelInset);
        removeStyleProperty(mapContainer.style, PANEL_OFFSET_BOTTOM_VAR);
      }
      removeStyleProperty(mapContainer.style, RESERVED_RIGHT_VAR);
      removeStyleProperty(mapContainer.style, PANEL_OFFSET_RIGHT_VAR);
      return;
    }

    const conflictingCorners = queryCornerNodes(mapContainer, [
      ".leaflet-top.leaflet-right",
      ".leaflet-bottom.leaflet-right",
    ]);
    const panelInset = `${measureInset(panelState.element, "width") + 24}px`;
    const controlInset = `${getCornerExtent(conflictingCorners, "width") + 24}px`;
    if (getCornerPriority(conflictingCorners) === TILIA_CONTROL_PRIORITY.high) {
      setStyleProperty(mapContainer.style, PANEL_OFFSET_RIGHT_VAR, controlInset);
      removeStyleProperty(mapContainer.style, RESERVED_RIGHT_VAR);
    } else {
      setStyleProperty(mapContainer.style, RESERVED_RIGHT_VAR, panelInset);
      removeStyleProperty(mapContainer.style, PANEL_OFFSET_RIGHT_VAR);
    }
    removeStyleProperty(mapContainer.style, RESERVED_BOTTOM_VAR);
    removeStyleProperty(mapContainer.style, PANEL_OFFSET_BOTTOM_VAR);
  }

  function observePanel(element) {
    disconnectPanelObserver();
    const ResizeObserverCtor = ownerDocument.defaultView?.ResizeObserver || globalThis.ResizeObserver;
    if (!ResizeObserverCtor || !element) {
      return;
    }
    panelObserver = new ResizeObserverCtor(() => {
      applyPanelState();
    });
    panelObserver.observe(element);
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
    setPanelState(nextState = {}) {
      panelState = {
        active: !!nextState.active,
        layout: nextState.layout === "bottom" ? "bottom" : "side",
        element: nextState.element || null,
      };

      if (panelState.active && panelState.element) {
        observePanel(panelState.element);
      } else {
        disconnectPanelObserver();
      }

      applyPanelState();
    },
    unmount(id) {
      items.get(id)?.handle.unmount();
    },
  };
}