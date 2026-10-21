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

export function createRectangleSelection({ map, onComplete, onActiveChange }) {
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

  function suppressGestureClick() {
    suppressNextClick = true;
    clearTimeout(suppressClickTimer);
    suppressClickTimer = setTimeout(() => {
      suppressNextClick = false;
      suppressClickTimer = null;
    }, 0);
  }

  function containerPoint(event) {
    const rect = container.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function clearDrag() {
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
    clearDrag();
    shield?.remove();
    shield = null;
    if (restoreDragging) {
      map.dragging.enable();
    }
    restoreDragging = false;
    active = false;
    document.removeEventListener("keydown", onKeyDown, true);
    onActiveChange?.(false);
  }

  function onPointerDown(event) {
    if (event.button !== 0 || dragging) return;
    event.preventDefault();
    event.stopPropagation();
    dragging = true;
    dragPointerId = event.pointerId;
    dragStart = containerPoint(event);
    rectangle = document.createElement("div");
    rectangle.className = "tilia-track-editor-selection-rectangle";
    shield.appendChild(rectangle);
    shield.setPointerCapture?.(event.pointerId);
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
    shield.releasePointerCapture?.(event.pointerId);
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

  function onShieldClick(event) {
    suppressNextClick = false;
    clearTimeout(suppressClickTimer);
    suppressClickTimer = null;
    event.preventDefault();
    event.stopPropagation();
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
  container.addEventListener("click", onContainerClick, true);

  return {
    activate() {
      if (active) return;
      active = true;
      restoreDragging = map.dragging.enabled();
      if (restoreDragging) map.dragging.disable();
      shield = document.createElement("div");
      shield.className = "tilia-track-editor-selection-shield";
      shield.addEventListener("pointerdown", onPointerDown);
      shield.addEventListener("pointermove", onPointerMove);
      shield.addEventListener("pointerup", onPointerUp);
      shield.addEventListener("pointercancel", onPointerCancel);
      shield.addEventListener("click", onShieldClick);
      container.appendChild(shield);
      document.addEventListener("keydown", onKeyDown, true);
      onActiveChange?.(true);
    },
    cancel() { deactivate(); },
    isActive() { return active; },
    isDragging() { return dragging; },
    destroy() {
      deactivate();
      clearTimeout(suppressClickTimer);
      container.removeEventListener("click", onContainerClick, true);
    },
  };
}
