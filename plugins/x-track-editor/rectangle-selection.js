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
  let dragging = false;
  let dragPointerId = null;
  let dragStart = null;
  let shield = null;
  let rectangle = null;
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

  function clearDrag() {
    if (dragPointerId !== null && container.hasPointerCapture?.(dragPointerId)) container.releasePointerCapture(dragPointerId);
    dragging = false;
    dragPointerId = null;
    dragStart = null;
    rectangle?.remove();
    rectangle = null;
  }

  function updateRectangle(end) {
    const bounds = normalizeBounds(dragStart, end);
    rectangle.style.left = `${bounds.min.x}px`;
    rectangle.style.top = `${bounds.min.y}px`;
    rectangle.style.width = `${bounds.max.x - bounds.min.x}px`;
    rectangle.style.height = `${bounds.max.y - bounds.min.y}px`;
    return bounds;
  }

  function deactivate() {
    if (!active) return;
    active = false;
    const ended = gesture; gesture = null;
    for (const cleanup of [clearDrag, () => shield?.remove(), restoreMapDragging]) {
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
    if (event.button !== 0 || dragging) return;
    // Route capture only for the map, preserving shell controls and assigned UI.
    if (event.target?.closest?.(".leaflet-control, .leaflet-popup, .tilia-ui-surface-root")) return;
    event.preventDefault();
    event.stopPropagation();
    dragging = true;
    dragPointerId = event.pointerId;
    dragStart = containerPoint(event);
    rectangle = document.createElement("div");
    rectangle.className = "tilia-track-editor-selection-rectangle";
    shield.appendChild(rectangle);
    container.setPointerCapture?.(event.pointerId);
    updateRectangle(dragStart);
  }

  function onPointerMove(event) {
    if (!dragging || event.pointerId !== dragPointerId) return;
    event.preventDefault();
    updateRectangle(containerPoint(event));
  }

  function onPointerUp(event) {
    if (!dragging || event.pointerId !== dragPointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = updateRectangle(containerPoint(event));
    if (container.hasPointerCapture?.(event.pointerId)) container.releasePointerCapture(event.pointerId);
    clearDrag();
    suppressGestureClick();
    const outcome = onComplete?.(bounds) || "retry";
    if (outcome === "success" || outcome === "cancel") {
      deactivate();
    }
  }

  function onPointerCancel(event) {
    if (dragging && event.pointerId === dragPointerId) {
      clearDrag();
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
      active = true;
      restoreDragging = map.dragging.enabled();
      const wasDragging = restoreDragging;
      let restored = false;
      const restore = () => { if (!restored && wasDragging) { map.dragging.enable(); restored = true; } };
      restoreMapDragging = restore;
      gesture.defer(restore, { label: "restore-map-dragging", retry: "safe" });
      gesture.defer(clearDrag, { label: "release-rectangle-gesture", retry: "safe" });
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
    isDragging() { return dragging; },
    destroy() {
      deactivate();
      clearTimeout(suppressClickTimer);
      // Scoped listener records are removed by the owning rectangle scope.
    },
  };
}
