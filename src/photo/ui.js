import { domainMount } from "../ui/domain-mount.js";
import { listen, node } from "../ui/scoped-dom.js";

export function formatCaptured(value, mode = "auto") {
  if (value === null) return "-";
  const date = new Date(value);
  return mode === "utc" ? date.toUTCString() : date.toLocaleString();
}
export function mountPreview({ container, scope, entry, photo, report, className, entries, withdraw }) {
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
    if (entries && !entries.get(entry.id)) { clear(); withdraw?.(); return; }
    try {
      preview = photo.getPreview(entry.id, { scope });
      if (!preview) { clear(); return; }
      preview.signal.addEventListener("abort", invalidated, { once: true });
      if (preview.isCurrent()) image.src = preview.readUrl(); else invalidated();
    } catch (error) { clear(); if (scope.alive) report(error); }
  };
  listen(scope, image, "error", () => { if (preview?.isCurrent()) clear(); }, report);
  scope.defer(() => { clear(); preview?.signal.removeEventListener("abort", invalidated); preview?.release(); image.remove(); }, { retry: "safe" });
  bind(); return image;
}

export function mountPhotoRow(input) {
  const { container, scope, entry, photo, selection, report, map } = input;
  const model = domainMount({ ...input, domain: photo });
  let image;
  const button = node(container, "button", "tilia-layer-name"); button.type = "button";
  const meta = node(container, "div", "tilia-layer-meta");
  const reveal = node(container, "button", "tilia-photo-reveal", "Reveal"); reveal.type = "button";
  const render = (view) => {
    const { data, derived, preferences } = view.snapshot;
    button.textContent = data.name; if (image) image.alt = data.name;
    meta.textContent = `${formatCaptured(data.capturedAt, preferences.requestedTimeMode)} / ${derived.locationSource ?? "-"}`;
    reveal.disabled = !(data.coordinate ?? derived.inferredLocation);
    button.setAttribute("aria-pressed", String(selection.getCurrent()?.entryId === entry.id));
  };
  listen(scope, button, "click", () => { if (model.current()) selection.request(photo.selection.createCandidate(entry.id)); }, report);
  listen(scope, reveal, "click", () => { const view = model.current(); if (!view) return; const coordinate = view.snapshot.data.coordinate ?? view.snapshot.derived.inferredLocation; if (coordinate && model.current()) map?.panTo({ lat: coordinate.lat, lng: coordinate.lon }); }, report);
  model.subscribe(render);
  const subscription = selection.subscribe(() => model.update(render)); scope.defer(() => subscription.unsubscribe(), { retry: "safe" });
  model.update(render); image = mountPreview({ ...input, className: "tilia-layer-thumbnail" });
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
export function mountPhotoSettings(input) {
  const { container, scope, entry, photo, report } = input, model = domainMount({ ...input, domain: photo });
  const title = node(container, "h3", "tilia-photo-settings-name");
  const select = node(container, "select", "tilia-photo-time-mode-select"); model.controls.add(select);
  for (const mode of ["auto", "local", "utc"]) { const option = node(select, "option", "", mode === "utc" ? "UTC" : mode); option.value = mode; }
  const render = (view) => { title.textContent = view.snapshot.data.name; select.setAttribute("aria-label", `${title.textContent} photo time mode`); select.value = view.snapshot.preferences.requestedTimeMode; };
  listen(scope, select, "change", () => { const mode = select.value; return model.command((view) => photo.setRequestedTimeMode(entry.id, mode, { expectedRevision: view.revision }), render); }, report);
  model.subscribe(render); model.update(render);
}
