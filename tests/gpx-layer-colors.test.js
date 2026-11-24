import { expect, it, vi } from "vitest";
import { createScopeController } from "../src/ownership/index.js";
import { createGpxLayerColors } from "../src/gpx/layer-colors.js";
import { normalizeGpxDocument } from "../src/gpx/document.js";
import { queryGpx } from "../src/gpx/queries.js";
import { mountGpxRow } from "../src/gpx/ui.js";
import { byClass, documentFixture } from "./helpers/scoped-dom.js";

it("keeps only logical colors across generations and releases them with the entry", async () => {
  const owner = createScopeController();
  const target = { kind: "track", trackIndex: 0 };
  const base = "#0099cc";
  let activeToken = "one", live = true, notify;
  const colors = createGpxLayerColors({
    scope: owner.scope,
    entries: { get: () => live ? { id: 1 } : null, subscribe: (handler) => { notify = handler; } },
    rendering: { getStatus: () => ({
      state: "active", visible: true, currentToken: activeToken, semanticRevision: 1, currentRevision: 1,
    }) },
  });
  const generation = (token) => {
    const child = owner.scope.child();
    const drawable = colors.begin({
      entryId: 1, scope: child, currency: { token, isCurrent: () => child.alive },
      visibility: { isVisible: () => true },
    })(target, base);
    const paint = vi.fn();
    drawable.paint.push(paint);
    return { child, paint };
  };
  const old = generation("one");
  expect(colors.set(1, target, "one", "#334455")).toBe(true);
  expect(old.paint).toHaveBeenCalledExactlyOnceWith("#334455");
  const fresh = generation("two");
  activeToken = "two";
  await old.child.dispose();
  expect(colors.get(1, target)).toEqual({ color: "#334455", override: "#334455", token: "two" });
  expect(colors.set(1, target, "one", "#abcdef")).toBe(false);
  expect(fresh.paint).not.toHaveBeenCalled();
  expect(colors.set(1, target, "two", "#abcdef")).toBe(true);
  expect(fresh.paint).toHaveBeenCalledExactlyOnceWith("#abcdef");

  live = false;
  notify({ type: "removed", previous: { id: 1 } });
  await fresh.child.dispose();
  expect(colors.get(1, target)).toEqual({ color: undefined, override: undefined, token: undefined });
  await owner.close();
  expect(owner.snapshot().counts.children).toBe(0);
});

it("updates color controls without querying Fit bounds until GPX data changes", async () => {
  const owner = createScopeController();
  const container = documentFixture().body;
  const entry = { id: 1 };
  const points = [{ lat: 35, lon: 135 }, { lat: 36, lon: 136 }];
  const data = normalizeGpxDocument({ tracks: [{ name: "Track", segments: [{ points }] }] });
  let view = { entry, revision: 1, snapshot: { data, preferences: {
    tracksVisible: true, trackVisibility: {}, stylePresetId: "default",
  } } };
  let onEntryChange, refreshColors;
  let state = { token: "1", color: "#0099cc" };
  const get = vi.fn(() => state);
  const set = vi.fn((entryId, target, token, color) => { state = { token, color }; return true; });
  let service = { get, set };
  const getExtent = vi.fn((entryId, { target }) => queryGpx(view, "extent", target));
  const report = vi.fn();
  mountGpxRow({
    container, scope: owner.scope, entry,
    gpx: { get: () => view, getExtent },
    entries: {
      get: () => entry,
      subscribe(listener) { onEntryChange = listener; return { unsubscribe() {} }; },
    },
    selection: { getCurrent: () => null, subscribe: () => ({ unsubscribe() {} }) },
    report,
    colorService: () => service,
    subscribeColors(refresh) { refreshColors = refresh; },
  });
  const [picker] = byClass(container, "tilia-gpx-color-picker");
  const [swatch] = byClass(container, "tilia-gpx-swatch");
  const trackFit = byClass(container, "tilia-gpx-fit")[1];
  expect(getExtent).toHaveBeenCalledTimes(3);
  expect(trackFit.disabled).toBe(false);

  getExtent.mockClear();
  picker.value = "#345678";
  picker.dispatchEvent(new Event("change"));
  expect(set).toHaveBeenCalledExactlyOnceWith(1, { kind: "track", trackIndex: 0 }, "1", "#345678");
  expect(picker.value).toBe("#345678");
  expect(getExtent).not.toHaveBeenCalled();

  state = { override: "#345678" };
  refreshColors();
  expect(picker.disabled).toBe(true);
  expect(swatch.hidden).toBe(false);
  expect(swatch.style.backgroundColor).toBe("#345678");

  service = null;
  refreshColors();
  expect(swatch.style.backgroundColor).toBe("#0099cc");

  state = { token: "2", color: "#0099cc" };
  service = { get, set };
  refreshColors();
  expect(picker.disabled).toBe(false);
  expect(picker.value).toBe("#0099cc");
  expect(getExtent).not.toHaveBeenCalled();

  const replacement = normalizeGpxDocument({ tracks: [{ name: "Empty", segments: [{ points: [] }] }] });
  view = { ...view, revision: 2, snapshot: { ...view.snapshot, data: replacement } };
  onEntryChange({ type: "domain-changed", entry });
  expect(getExtent).toHaveBeenCalledTimes(3);
  expect(trackFit.disabled).toBe(true);
  expect(byClass(container, "tilia-gpx-color-picker")[0]).toBe(picker);
  expect(picker.attributes["aria-label"]).toBe("Change color of Empty");
  expect(report).not.toHaveBeenCalled();

  await owner.close();
  set.mockClear();
  get.mockClear();
  picker.dispatchEvent(new Event("change"));
  refreshColors();
  expect(set).not.toHaveBeenCalled();
  expect(get).not.toHaveBeenCalled();
});
