import { listen, node } from "../ui/scoped-dom.js";

export function formatCaptured(value, mode = "auto") {
  if (value === null) return "-";
  const date = new Date(value);
  return mode === "utc" ? date.toUTCString() : date.toLocaleString();
}
export function mountPreview({ container, scope, entry, photo, report, className }) {
  const image = node(container, "img", className);
  image.alt = photo.get(entry.id).snapshot.data.name;
  let preview = null;
  let rebindQueued = false;
  const clear = () => image.removeAttribute("src");
  const invalidated = () => {
    clear();
    preview?.signal.removeEventListener("abort", invalidated);
    preview?.release();
    if (scope.alive && !rebindQueued) {
      rebindQueued = true;
      queueMicrotask(() => { rebindQueued = false; if (scope.alive) bind(); });
    }
  };
  const bind = () => {
    try {
      preview = photo.getPreview(entry.id, { scope });
      if (!preview) { clear(); return; }
      preview.signal.addEventListener("abort", invalidated, { once: true });
      if (preview.isCurrent()) image.src = preview.readUrl(); else invalidated();
    } catch (error) { clear(); if (scope.alive) report(error); }
  };
  listen(scope, image, "error", () => { if (preview?.isCurrent()) clear(); }, report);
  scope.defer(() => { clear(); preview?.signal.removeEventListener("abort", invalidated); preview?.release(); image.remove(); }, { retry: "safe" });
  bind();
}

export function mountPhotoRow({ container, scope, entry, photo, selection, report }) {
  const { data, derived, preferences } = photo.get(entry.id).snapshot;
  const button = node(container, "button", "tilia-layer-name", data.name);
  listen(scope, button, "click", () => selection.request(photo.selection.createCandidate(entry.id)), report);
  node(container, "div", "tilia-layer-meta", `${formatCaptured(data.capturedAt, preferences.requestedTimeMode)} / ${derived.locationSource ?? "-"}`);
  mountPreview({ container, scope, entry, photo, report, className: "tilia-layer-thumbnail" });
}
export function mountPhotoPopup({ container, scope, selection, photo, report }) {
  const entry = photo.get(selection.entryId).entry;
  const { data, derived, preferences } = photo.get(entry.id).snapshot;
  node(container, "h3", "tilia-popup-title", data.name);
  const values = [["Captured", formatCaptured(data.capturedAt, preferences.requestedTimeMode)],
    ["Camera", `${data.make} ${data.model}`.trim() || "-"],
    ["Latitude", (data.coordinate ?? derived.inferredLocation)?.lat ?? "-"], ["Longitude", (data.coordinate ?? derived.inferredLocation)?.lon ?? "-"],
    ["Location", derived.locationSource ?? "-"]];
  for (const [label, value] of values) node(container, "div", "tilia-popup-row", `${label}: ${value}`);
  mountPreview({ container, scope, entry, photo, report, className: "tilia-popup-thumbnail" });
}
export function mountPhotoSettings({ container, scope, entry, photo, report }) {
  const { snapshot } = photo.get(entry.id);
  node(container, "h3", "tilia-photo-settings-name", snapshot.data.name);
  const select = node(container, "select", "tilia-photo-time-mode-select");
  select.setAttribute("aria-label", `${snapshot.data.name} photo time mode`);
  for (const mode of ["auto", "local", "utc"]) {
    const option = node(select, "option", "", mode === "utc" ? "UTC" : mode);
    option.value = mode;
  }
  select.value = snapshot.preferences.requestedTimeMode;
  listen(scope, select, "change", async () => {
    try {
      const current = photo.get(entry.id);
      await photo.setRequestedTimeMode(entry.id, select.value, { expectedRevision: current.revision });
    } catch (error) {
      report(error);
      if (scope.alive) select.value = photo.get(entry.id).snapshot.preferences.requestedTimeMode;
    }
  }, report);
}
