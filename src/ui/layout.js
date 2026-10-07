// Application-owned presentation annotations. Plugins expose only their assigned
// surface subtree; measurements and map-container writes remain inside the host.
const leases = new WeakMap();
const variables = ["--tilia-reserved-right", "--tilia-reserved-bottom", "--tilia-panel-offset-right", "--tilia-panel-offset-bottom"];
export function createLayoutHost({ container, scope, onError }) {
  if (!container || !scope) return () => {};
  const token = {}; leases.set(container, token);
  const style = container.style;
  const get = (key) => style.getPropertyValue?.(key) ?? style[key] ?? "";
  const priority = (key) => style.getPropertyPriority?.(key) ?? "";
  const original = new Map(variables.map((key) => [key, { value: get(key), priority: priority(key) }]));
  const originalLayout = container.dataset.tiliaPanelLayout;
  const writes = new Map(), relinquished = new Set(); let layoutWrite, layoutWritten = false, layoutRelinquished = false, queued = false;
  const set = (key, value, importance = "") => { if (style.setProperty) style.setProperty(key, value, importance); else style[key] = value; writes.set(key, { value, priority: importance }); };
  const query = (selector) => [...(container.querySelectorAll?.(selector) ?? [])];
  const measure = (node, axis) => Math.ceil(node?.getBoundingClientRect?.()[axis] ?? node?.[axis === "width" ? "offsetWidth" : "offsetHeight"] ?? 0);
  const resize = typeof ResizeObserver === "function" ? new ResizeObserver(() => schedule()) : null;
  const apply = () => {
    if (!scope.alive || leases.get(container) !== token) return;
    resize?.disconnect();
    const panel = query("[data-tilia-panel-layout]").find((n) => n !== container && !n.classList.contains("tilia-side-panel-hidden"));
    const layout = panel?.dataset.tiliaPanelLayout;
    if (layoutWritten && container.dataset.tiliaPanelLayout !== layoutWrite) layoutRelinquished = true;
    if (!layoutRelinquished) {
      if (layout) { if (container.dataset.tiliaPanelLayout !== layout) container.dataset.tiliaPanelLayout = layout; } else if (container.dataset.tiliaPanelLayout !== undefined) delete container.dataset.tiliaPanelLayout;
      layoutWritten = true; layoutWrite = layout;
    }
    const values = Object.fromEntries(variables.map((key) => [key, "0px"]));
    if (panel) {
      const bottom = layout === "bottom", axis = bottom ? "height" : "width";
      const corners = query(bottom ? ".leaflet-bottom" : ".leaflet-right");
      const keep = corners.some((corner) => [...(corner.querySelectorAll?.(".tilia-map-control") ?? [])].some((c) => c.dataset.tiliaEdgePolicy === "keep"));
      const side = bottom ? "bottom" : "right";
      values[`--tilia-${keep ? "panel-offset" : "reserved"}-${side}`] = `${(keep ? Math.max(0, ...corners.map((n) => measure(n, axis))) : measure(panel, axis)) + 24}px`;
      resize?.observe(panel); corners.forEach((n) => resize?.observe(n));
    }
    for (const key of variables) {
      const last = writes.get(key);
      if (last && (get(key) !== last.value || priority(key) !== last.priority)) relinquished.add(key);
      if (!relinquished.has(key)) set(key, values[key]);
    }
  };
  const schedule = () => { if (queued || !scope.alive) return; queued = true; queueMicrotask(() => { queued = false; try { apply(); } catch (error) { onError(error); } }); };
  const mutation = typeof MutationObserver === "function" ? new MutationObserver((records) => { if (records.some((record) => record.target !== container || record.type !== "attributes")) schedule(); }) : null;
  scope.defer(() => { mutation?.disconnect(); resize?.disconnect(); if (leases.get(container) !== token) return;
    for (const [key, last] of writes) if (get(key) === last.value && priority(key) === last.priority) {
      const prior = original.get(key); if (prior.value) { if (style.setProperty) style.setProperty(key, prior.value, prior.priority); else style[key] = prior.value; }
      else if (style.removeProperty) style.removeProperty(key); else delete style[key];
    }
    if (layoutWritten && container.dataset.tiliaPanelLayout === layoutWrite) { if (originalLayout === undefined) delete container.dataset.tiliaPanelLayout; else container.dataset.tiliaPanelLayout = originalLayout; }
    leases.delete(container);
  }, { label: "ui-layout", retry: "safe" });
  // Observe presentation/control mutations; omit style and the map's own layout
  // attribute so our annotation writes do not schedule a feedback loop.
  mutation?.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-tilia-panel-layout"] });
  return schedule;
}
