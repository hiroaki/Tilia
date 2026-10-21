import { domainMount } from "../ui/domain-mount.js";
import { listen, node } from "../ui/scoped-dom.js";
import { buildFixedOffsetTimeMode, splitFixedOffsetTimeMode } from "../core/photo-time-utils.js";

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
  container.classList.add("tilia-photo-layer-content");
  const text = node(container, "div", "tilia-photo-row-text");
  const button = node(text, "button", "tilia-layer-name"); button.type = "button";
  const meta = node(text, "div", "tilia-layer-meta");
  const navigation = node(text, "div", "tilia-photo-navigation");
  const fit = node(navigation, "button", "tilia-control-button tilia-photo-fit", "Fit"); fit.type = "button";
  const reveal = node(navigation, "button", "tilia-control-button tilia-photo-reveal", "Reveal"); reveal.type = "button";
  const coordinate = (view) => {
    const point = view.snapshot.data.coordinate ?? view.snapshot.derived.inferredLocation;
    return point && Number.isFinite(point.lat) && Number.isFinite(point.lon) ? point : null;
  };
  const render = (view) => {
    const { data, derived, preferences } = view.snapshot;
    button.textContent = data.name; if (image) image.alt = data.name;
    meta.textContent = `${formatCaptured(data.capturedAt, preferences.requestedTimeMode)} / ${derived.locationSource ?? "-"}`;
    fit.disabled = reveal.disabled = !coordinate(view);
    fit.setAttribute("aria-label", `Fit ${data.name}`);
    reveal.setAttribute("aria-label", `Reveal ${data.name}`);
    fit.title = reveal.title = reveal.disabled ? "No coordinates available" : "";
    button.setAttribute("aria-pressed", String(selection.getCurrent()?.entryId === entry.id));
  };
  listen(scope, button, "click", () => { if (model.current()) return selection.request(photo.selection.createCandidate(entry.id)); }, report);
  const revealPhoto = async () => {
    const view = model.current(); if (!view || !coordinate(view)) return;
    const requested = await selection.request(photo.selection.createCandidate(entry.id));
    const latest = model.current();
    if (!latest || latest.revision !== view.revision || selection.getCurrent() !== requested) return;
    const point = coordinate(latest);
    if (point) map?.panTo({ lat: point.lat, lng: point.lon });
  };
  listen(scope, reveal, "click", revealPhoto, report);
  listen(scope, button, "dblclick", (event) => { event.preventDefault(); return revealPhoto(); }, report);
  listen(scope, fit, "click", () => {
    const view = model.current(); if (!view) return;
    const point = coordinate(view), latest = model.current();
    if (point && latest?.revision === view.revision) map?.fitBounds(
      [[point.lat, point.lon], [point.lat, point.lon]], { padding: [20, 20], maxZoom: 18 },
    );
  }, report);
  model.subscribe(render);
  const subscription = selection.subscribe(() => model.update(render)); scope.defer(() => subscription.unsubscribe(), { retry: "safe" });
  model.update(render); image = mountPreview({ ...input, className: "tilia-layer-thumbnail" });
}
export function mountPhotoPopup({ container, scope, selection, photo, report }) {
  container.classList.add("tilia-popup");
  const entry = photo.get(selection.entryId).entry;
  const { data, derived, preferences } = photo.get(entry.id).snapshot;
  node(container, "h3", "tilia-popup-title", data.name);
  mountPreview({ container, scope, entry, photo, report, className: "tilia-popup-thumbnail" });
  const coordinate = data.coordinate ?? derived.inferredLocation;
  const formatCoordinate = (value) => Number.isFinite(value) ? value.toFixed(6) : "-";
  const values = [["Captured", formatCaptured(data.capturedAt, preferences.requestedTimeMode)],
    ["Camera", `${data.make} ${data.model}`.trim() || "-"],
    ["Latitude", formatCoordinate(coordinate?.lat)], ["Longitude", formatCoordinate(coordinate?.lon)],
    ["Location", derived.locationSource ?? "-"]];
  const body = node(container, "div", "tilia-popup-body");
  for (const [label, value] of values) {
    const row = node(body, "div", "tilia-popup-row");
    node(row, "span", "tilia-popup-label", label);
    node(row, "strong", "tilia-popup-value", value);
  }
  if (derived.locationSource === "exif-gps") {
    node(container, "div", "tilia-popup-detail", "Read directly from EXIF GPS");
  }
}
export function mountPhotoSettings(input) {
  const { container, scope, entry, photo, report } = input, model = domainMount({ ...input, domain: photo });
  container.classList.add("tilia-photo-settings");
  const title = node(container, "h3", "tilia-photo-settings-name");
  const label = node(container, "label", "tilia-photo-setting-label", "Photo time");
  const select = node(label, "select", "tilia-control-select tilia-photo-time-mode-select"); model.controls.add(select);
  for (const mode of ["auto", "local", "utc", "custom"]) { const option = node(select, "option", "", mode === "custom" ? "Custom offset" : mode === "utc" ? "UTC" : mode); option.value = mode; }
  const custom = node(container, "div", "tilia-photo-time-custom");
  const sign = node(custom, "select", "tilia-control-select tilia-photo-time-sign");
  for (const value of ["+", "-"]) { const option = node(sign, "option", "", value); option.value = value; }
  const offset = node(custom, "input", "tilia-control-select tilia-photo-time-offset"); offset.type = "time"; offset.step = "60";
  model.controls.add(sign); model.controls.add(offset);
  let draft = false, renderedMode;
  const render = (view) => {
    title.textContent = view.snapshot.data.name;
    select.setAttribute("aria-label", `${title.textContent} photo time mode`);
    sign.setAttribute("aria-label", `${title.textContent} photo time offset sign`);
    offset.setAttribute("aria-label", `${title.textContent} photo time offset`);
    const mode = view.snapshot.preferences.requestedTimeMode;
    if (draft && mode === renderedMode) return;
    draft = false; renderedMode = mode;
    const fixed = splitFixedOffsetTimeMode(mode);
    select.value = fixed ? "custom" : mode;
    custom.hidden = !fixed; sign.disabled = offset.disabled = !fixed;
    sign.value = fixed?.sign ?? "+"; offset.value = fixed?.time ?? "00:00";
  };
  const apply = async (mode) => {
    draft = false;
    await model.command((view) => photo.setRequestedTimeMode(entry.id, mode, { expectedRevision: view.revision }), render);
  };
  const applyCustom = async () => {
    if (select.value !== "custom") return;
    try {
      if (!offset.value || !offset.validity.valid) throw new Error("Enter a valid photo time offset");
      await apply(buildFixedOffsetTimeMode(sign.value, offset.value));
    } catch (error) { draft = false; model.update(render); throw error; }
  };
  listen(scope, select, "change", () => {
    if (select.value !== "custom") return apply(select.value);
    draft = true; custom.hidden = false; sign.disabled = offset.disabled = false; offset.focus();
  }, report);
  listen(scope, offset, "input", () => { draft = true; }, report);
  listen(scope, sign, "change", () => { draft = true; }, report);
  listen(scope, offset, "change", () => { draft = true; }, report);
  listen(scope, custom, "focusout", (event) => {
    if (event.relatedTarget === select || custom.contains(event.relatedTarget)) return;
    return applyCustom();
  }, report);
  for (const control of [sign, offset]) listen(scope, control, "keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); return applyCustom(); }
  }, report);
  model.subscribe(render); model.update(render);
}
