function normalizeBounds(start, end) {
  return {
    min: { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y) },
    max: { x: Math.max(start.x, end.x), y: Math.max(start.y, end.y) },
  };
}

export function selectPointIdsInContainerBounds(map, domain, bounds) {
  if (!domain || !bounds) return [];
  return domain.points
    .filter((point) => {
      const projected = map.latLngToContainerPoint([point.lat, point.lon]);
      return projected.x >= bounds.min.x && projected.x <= bounds.max.x
        && projected.y >= bounds.min.y && projected.y <= bounds.max.y;
    })
    .map((point) => point.id);
}

export function createRectangleSelection({ map, scope, parent, onComplete, onActiveChange, report = () => {} }) {
  scope.assertAlive();
  const bind = (target, type, callback, capture = false, owner = scope) => {
    const guarded = owner.guard(callback);
    owner.defer(() => target.removeEventListener(type, guarded, capture), { retry: "safe" });
    target.addEventListener(type, guarded, capture);
  };
  const container = map.getContainer();
  let active = false;
  let dragState = null;
  let shield = null;
  let restoreDragging = false;
  let suppressNextClick = false;
  let suppressClickTimer = null;
  let keyListener = null;
  let gesture = null;
  let restoreMapDragging = null;

  function suppressGestureClick() {
    suppressNextClick = true;
    clearTimeout(suppressClickTimer);
    suppressClickTimer = setTimeout(() => {
      if (scope.alive) suppressNextClick = false;
      suppressClickTimer = null;
    }, 0);
  }

  function containerPoint(event) {
    const rect = container.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function clearDrag(state = dragState) {
    if (!state) return;
    // A later gesture may have reused this pointer before an old cleanup retry.
    const reusedPointer = state !== dragState && dragState?.pointerId === state.pointerId;
    if (!reusedPointer && state.pointerId !== null && container.hasPointerCapture?.(state.pointerId)) {
      container.releasePointerCapture(state.pointerId);
    }
    state.dragging = false;
    state.pointerId = null;
    state.start = null;
    state.rectangle?.remove();
    state.rectangle = null;
  }

  function updateRectangle(state, end) {
    const bounds = normalizeBounds(state.start, end);
    state.rectangle.style.left = `${bounds.min.x}px`;
    state.rectangle.style.top = `${bounds.min.y}px`;
    state.rectangle.style.width = `${bounds.max.x - bounds.min.x}px`;
    state.rectangle.style.height = `${bounds.max.y - bounds.min.y}px`;
    return bounds;
  }

  function deactivate() {
    if (!active) return;
    active = false;
    const ended = gesture; gesture = null;
    const endedDrag = dragState; dragState = null;
    for (const cleanup of [() => clearDrag(endedDrag), () => shield?.remove(), restoreMapDragging]) {
      try { cleanup?.(); } catch (error) { report(error); }
    }
    restoreMapDragging = null;
    // Independent owned gesture records restore dragging, release capture,
    // remove the visual shield and detach callbacks even if one fails.
    void ended?.dispose().catch(report);
    shield = null;
    keyListener = null;
    restoreDragging = false;
    onActiveChange?.(false);
  }

  function onPointerDown(event) {
    const state = dragState;
    if (!state || event.button !== 0 || state.dragging) return;
    // Route capture only for the map, preserving shell controls and assigned UI.
    if (event.target?.closest?.(".leaflet-control, .leaflet-popup, .tilia-ui-surface-root")) return;
    event.preventDefault();
    event.stopPropagation();
    state.dragging = true;
    state.pointerId = event.pointerId;
    state.start = containerPoint(event);
    state.rectangle = document.createElement("div");
    state.rectangle.className = "tilia-track-editor-selection-rectangle";
    shield.appendChild(state.rectangle);
    container.setPointerCapture?.(event.pointerId);
    updateRectangle(state, state.start);
  }

  function onPointerMove(event) {
    const state = dragState;
    if (!state?.dragging || event.pointerId !== state.pointerId) return;
    event.preventDefault();
    updateRectangle(state, containerPoint(event));
  }

  function onPointerUp(event) {
    const state = dragState;
    if (!state?.dragging || event.pointerId !== state.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = updateRectangle(state, containerPoint(event));
    if (container.hasPointerCapture?.(event.pointerId)) container.releasePointerCapture(event.pointerId);
    clearDrag(state);
    suppressGestureClick();
    const outcome = onComplete?.(bounds) || "retry";
    if (outcome === "success" || outcome === "cancel") {
      deactivate();
    }
  }

  function onPointerCancel(event) {
    const state = dragState;
    if (state?.dragging && event.pointerId === state.pointerId) {
      clearDrag(state);
    }
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      deactivate();
    }
  }

  function onContainerClick(event) {
    if (!suppressNextClick) return;
    suppressNextClick = false;
    clearTimeout(suppressClickTimer);
    suppressClickTimer = null;
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  bind(container, "click", onContainerClick, true);
  scope.defer(() => clearTimeout(suppressClickTimer), { retry: "safe" });
  scope.defer(deactivate, { label: "rectangle-gesture", retry: "safe" });
  const abortGesture = () => { try { deactivate(); } catch (error) { report(error); } };
  scope.signal.addEventListener("abort", abortGesture, { once: true });
  scope.defer(() => scope.signal.removeEventListener("abort", abortGesture), { retry: "safe" });

  return {
    activate() {
      scope.assertAlive();
      if (active) return;
      gesture = scope.child({ label: "rectangle-active-gesture" });
      const state = { dragging: false, pointerId: null, start: null, rectangle: null };
      dragState = state;
      active = true;
      restoreDragging = map.dragging.enabled();
      const wasDragging = restoreDragging;
      let restored = false;
      const restore = () => { if (!restored && wasDragging) { map.dragging.enable(); restored = true; } };
      restoreMapDragging = restore;
      gesture.defer(restore, { label: "restore-map-dragging", retry: "safe" });
      gesture.defer(() => clearDrag(state), { label: "release-rectangle-gesture", retry: "safe" });
      if (restoreDragging) map.dragging.disable();
      shield = document.createElement("div");
      shield.className = "tilia-track-editor-selection-shield";
      bind(container, "pointerdown", onPointerDown, true, gesture);
      bind(container, "pointermove", onPointerMove, true, gesture);
      bind(container, "pointerup", onPointerUp, true, gesture);
      bind(container, "pointercancel", onPointerCancel, true, gesture);
      const capturedShield = shield;
      gesture.defer(() => capturedShield.remove(), { retry: "safe" });
      parent.appendChild(shield);
      keyListener = gesture.guard(onKeyDown);
      const capturedKey = keyListener;
      gesture.defer(() => document.removeEventListener("keydown", capturedKey, true), { retry: "safe" });
      document.addEventListener("keydown", keyListener, true);
      onActiveChange?.(true);
    },
    cancel() { deactivate(); },
    isActive() { return active; },
    isDragging() { return dragState?.dragging ?? false; },
    destroy() {
      deactivate();
      clearTimeout(suppressClickTimer);
      // Scoped listener records are removed by the owning rectangle scope.
    },
  };
}
