import { domainMount } from "../ui/domain-mount.js";
import { listen, node } from "../ui/scoped-dom.js";
import { buildFixedOffsetTimeMode, parseFixedOffsetMinutes, splitFixedOffsetTimeMode } from "../core/photo-time-utils.js";

export function formatCaptured(value, mode = "auto") {
  if (value === null) return "-";
  const date = new Date(value);
  return mode === "utc" ? date.toUTCString() : date.toLocaleString();
}

const rowDateFormat = {
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
};

function canEditPhotoTime({ hasGps, capturedAt }) {
  return !hasGps && capturedAt !== null && Number.isFinite(new Date(capturedAt).getTime());
}

function formatRowCaptured({ data: { capturedAt, hasGps }, derived: { resolvedTimeMode, inferredTimestamp } }) {
  const captured = new Date(capturedAt ?? NaN);
  if (!Number.isFinite(captured.getTime())) return "-";
  if (hasGps) return captured.toLocaleString("ja-JP", rowDateFormat);
  if (resolvedTimeMode === null) return formatCaptured(capturedAt);

  if (resolvedTimeMode === "local") {
    const date = new Date(inferredTimestamp ?? capturedAt);
    const parts = new Intl.DateTimeFormat("en", { timeZoneName: "longOffset" }).formatToParts(date);
    const zone = parts.find(part => part.type === "timeZoneName")?.value;
    const offset = zone === "GMT" ? "+00:00" : /^GMT[+-]\d{2}:\d{2}$/.test(zone) ? zone.slice(3) : null;
    return offset ? `${date.toLocaleString("ja-JP", rowDateFormat)} ${offset}` : formatCaptured(capturedAt);
  }

  const offset = resolvedTimeMode === "utc" ? "+00:00" : resolvedTimeMode;
  const minutes = parseFixedOffsetMinutes(offset);
  if (minutes === null) return formatCaptured(capturedAt);
  // Without a GPX match, the explicit mode still interprets the captured wall time.
  const wallTime = inferredTimestamp === null
    ? captured.toLocaleString("ja-JP", rowDateFormat)
    : new Date(inferredTimestamp + minutes * 60_000).toLocaleString("ja-JP", { ...rowDateFormat, timeZone: "UTC" });
  return `${wallTime} ${offset}`;
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
  let timeForm;
  container.classList.add("tilia-photo-layer-content");
  const text = node(container, "div", "tilia-photo-row-text");
  const button = node(text, "button", "tilia-layer-name"); button.type = "button";
  const meta = node(text, "div", "tilia-layer-meta");
  const navigation = node(text, "div", "tilia-photo-navigation");
  const fit = node(navigation, "button", "tilia-control-button tilia-photo-fit", "Fit"); fit.type = "button";
  const coordinate = (view) => {
    const point = view.snapshot.data.coordinate ?? view.snapshot.derived.inferredLocation;
    return point && Number.isFinite(point.lat) && Number.isFinite(point.lon) ? point : null;
  };
  const render = (view) => {
    const { data } = view.snapshot;
    button.textContent = data.name; if (image) image.alt = data.name;
    meta.textContent = formatRowCaptured(view.snapshot);
    fit.disabled = !coordinate(view);
    fit.setAttribute("aria-label", `Fit ${data.name}`);
    fit.title = fit.disabled ? "No coordinates available" : "";
    if (canEditPhotoTime(data)) {
      timeForm ??= mountPhotoTime({ ...input, container: text, navigation, scope: scope.child({ label: "photo-time" }) });
      timeForm.render(view);
    } else if (timeForm) {
      timeForm.close();
      timeForm = null;
    }
  };
  const renderSelection = () => {
    button.setAttribute("aria-pressed", String(selection.getCurrent()?.entryId === entry.id));
  };
  listen(scope, button, "click", () => { if (model.current()) return selection.request(photo.selection.createCandidate(entry.id)); }, report);
  listen(scope, button, "dblclick", async (event) => {
    event.preventDefault();
    const view = model.current(); if (!view || !coordinate(view)) return;
    const requested = await selection.request(photo.selection.createCandidate(entry.id));
    const latest = model.current();
    if (!latest || latest.revision !== view.revision || selection.getCurrent() !== requested) return;
    const point = coordinate(latest);
    if (point) map?.panTo({ lat: point.lat, lng: point.lon });
  }, report);
  listen(scope, fit, "click", () => {
    const view = model.current(); if (!view) return;
    const point = coordinate(view), latest = model.current();
    if (point && latest?.revision === view.revision) map?.fitBounds(
      [[point.lat, point.lon], [point.lat, point.lon]], { padding: [20, 20], maxZoom: 18 },
    );
  }, report);
  model.subscribe(render);
  const subscription = selection.subscribe(() => model.update(renderSelection)); scope.defer(() => subscription.unsubscribe(), { retry: "safe" });
  renderSelection();
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
function mountPhotoTime(input) {
  const { container, navigation, scope, entry, photo, report } = input;
  const model = domainMount({ ...input, domain: photo });
  const select = node(navigation, "select", "tilia-control-select tilia-photo-time-mode-select"); model.controls.add(select);
  for (const mode of ["auto", "local", "utc", "custom"]) { const option = node(select, "option", "", mode === "custom" ? "Custom offset" : mode === "utc" ? "UTC" : mode); option.value = mode; }
  const custom = node(container, "div", "tilia-photo-time-custom");
  const sign = node(custom, "select", "tilia-control-select tilia-photo-time-sign");
  for (const value of ["+", "-"]) { const option = node(sign, "option", "", value); option.value = value; }
  const offset = node(custom, "input", "tilia-control-select tilia-photo-time-offset"); offset.type = "time"; offset.step = "60";
  model.controls.add(sign); model.controls.add(offset);
  const remove = () => { select.remove(); custom.remove(); };
  scope.defer(remove, { retry: "safe" });
  let draft = false, renderedMode;
  const render = (view) => {
    const { name } = view.snapshot.data;
    select.setAttribute("aria-label", `${name} photo time mode`);
    sign.setAttribute("aria-label", `${name} photo time offset sign`);
    offset.setAttribute("aria-label", `${name} photo time offset`);
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
    await model.command((view) => {
      if (canEditPhotoTime(view.snapshot.data)) return photo.setRequestedTimeMode(entry.id, mode, { expectedRevision: view.revision });
    }, render);
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
  return { render, close() {
    const closing = scope.dispose();
    remove();
    void closing.catch(report);
  } };
}
