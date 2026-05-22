import { TILIA_CONTROL_EDGE_POLICY, TILIA_CONTROL_PRIORITY, TILIA_UI_LAYER } from "./protocol.js";

const SURFACE_ROOT_CLASS = "tilia-ui-surface-root";
const RESERVED_RIGHT_VAR = "--tilia-reserved-right";
const RESERVED_BOTTOM_VAR = "--tilia-reserved-bottom";
const PANEL_OFFSET_RIGHT_VAR = "--tilia-panel-offset-right";
const PANEL_OFFSET_BOTTOM_VAR = "--tilia-panel-offset-bottom";
const PANEL_EDGE_GAP_PX = 24;

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

function resolveSurface(surface) {
  return Object.values(TILIA_UI_LAYER).includes(surface)
    ? surface
    : TILIA_UI_LAYER.floating;
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

function getCornerKeepPolicy(cornerNodes) {
  return cornerNodes.some((cornerNode) => queryPriorityControls(cornerNode).some((control) => {
    return control.dataset?.tiliaEdgePolicy === TILIA_CONTROL_EDGE_POLICY.keep;
  }));
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
      const panelInset = `${measureInset(panelState.element, "height") + PANEL_EDGE_GAP_PX}px`;
      const controlInset = `${getCornerExtent(conflictingCorners, "height") + PANEL_EDGE_GAP_PX}px`;
      if (getCornerKeepPolicy(conflictingCorners)) {
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
    const panelInset = `${measureInset(panelState.element, "width") + PANEL_EDGE_GAP_PX}px`;
    const controlInset = `${getCornerExtent(conflictingCorners, "width") + PANEL_EDGE_GAP_PX}px`;
    if (getCornerKeepPolicy(conflictingCorners)) {
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
    const normalizedSurface = resolveSurface(surface);
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

    const normalizedSurface = resolveSurface(surface);
    const normalizedPriority = resolvePriority(priority);
    const root = ensureSurfaceRoot(normalizedSurface);
    const current = items.get(id);
    if (current?.element === element) {
      if (current.surface !== normalizedSurface) {
        root.appendChild(element);
        current.surface = normalizedSurface;
      }
      current.priority = normalizedPriority;
      applySurfaceMetadata(element, normalizedSurface, current.priority);
      return current.handle;
    }

    if (current) {
      current.element.remove();
      items.delete(id);
    }

    applySurfaceMetadata(element, normalizedSurface, normalizedPriority);
    root.appendChild(element);

    const record = {
      id,
      surface: normalizedSurface,
      element,
      priority: normalizedPriority,
      handle: {
        element,
        unmount() {
          if (items.get(id)?.element === element) {
            element.remove();
            items.delete(id);
          }
        },
        update(nextOptions = {}) {
          const currentRecord = items.get(id);
          if (!currentRecord || currentRecord.element !== element) {
            return;
          }

          const nextSurface = resolveSurface(nextOptions.surface || currentRecord.surface);
          const nextPriority = resolvePriority(nextOptions.priority ?? currentRecord.priority);
          if (nextSurface !== currentRecord.surface) {
            mount({
              id,
              surface: nextSurface,
              element,
              priority: nextPriority,
            });
            return;
          }
          applySurfaceMetadata(element, nextSurface, nextPriority);
          currentRecord.priority = nextPriority;
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