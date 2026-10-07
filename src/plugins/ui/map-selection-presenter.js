import { CircleMarker, Popup } from "leaflet";
import { reportError } from "../../ui/scoped-dom.js";
export default Object.freeze({
  id: "tilia-map-selection-presenter",
  setup(context) {
    context.styles.use({ id: "tilia-selection-presentation", href: new URL("./selection-presentation.css", import.meta.url).href });
    const report = (error) => reportError(context, error);
    let state = null;
    const attempt = (cleanup) => { try { cleanup(); } catch (error) { report(error); } };
    const closePopup = (record) => {
      const popup = record.popup;
      if (!popup) return;
      record.popup = null;
      attempt(() => popup.layer.off("remove", popup.dismiss));
      attempt(() => popup.attachment?.dispose());
      // Leaflet fade-out delays DOM removal; this presenter owns the popup and
      // must withdraw its element immediately when authority is revoked.
      attempt(() => popup.layer.getElement()?.remove());
      void popup.scope.dispose().catch(report);
    };
    const close = (record = state) => {
      if (!record) return;
      if (state === record) state = null;
      record.handle.signal.removeEventListener("abort", record.abort);
      closePopup(record);
      attempt(() => record.highlight?.dispose());
      void record.scope.dispose().catch(report);
    };
    const mountPopup = (record) => {
      const adapter = context.contributions.popup.get(record.selection.domain);
      if (record.adapter === adapter && record.popup) return;
      closePopup(record);
      record.adapter = adapter;
      if (!adapter || record.dismissed || !record.handle.anchor) return;
      const scope = record.scope.child({ label: "popup" });
      const container = document.createElement("div");
      const layer = new Popup().setLatLng(record.handle.anchor).setContent(container);
      const popup = { scope, layer, attachment: null, dismiss() {
        if (state === record && record.popup === popup) {
          record.dismissed = true; closePopup(record);
        }
      } };
      record.popup = popup;
      scope.defer(() => container.replaceChildren(), { retry: "safe" });
      try {
        adapter.mount({ container, scope, selection: record.selection, presentation: record.handle });
        if (state !== record || !record.handle.isCurrent() || !scope.alive) { closePopup(record); return; }
        layer.on("remove", popup.dismiss);
        scope.defer(() => layer.off("remove", popup.dismiss), { retry: "safe" });
        popup.attachment = context.map.attachLayer(layer);
        scope.defer(() => popup.attachment.dispose(), { retry: "safe" });
        if (state !== record || !record.handle.isCurrent() || !scope.alive) closePopup(record);
      } catch (error) { closePopup(record); report(error); }
    };
    const reconcile = () => {
      if (!context.scope.alive) return;
      const selection = context.selection.getCurrent();
      if (state && state.selection === selection && state.handle.isCurrent()) { mountPopup(state); return; }
      close();
      if (!selection) return;
      const handle = context.presentation.resolve(selection.entryId, selection.ref);
      if (!handle?.anchor || !handle.isCurrent()) return;
      const scope = context.scope.child({ label: "selection-presentation" });
      const record = { scope, handle, selection, dismissed: false, adapter: null, popup: null, highlight: null,
        abort: () => close(record) };
      state = record;
      handle.signal.addEventListener("abort", record.abort, { once: true });
      scope.defer(() => handle.signal.removeEventListener("abort", record.abort), { retry: "safe" });
      try {
        const descriptor = handle.highlightDescriptor;
        if (descriptor?.kind === "point") {
          const highlight = new CircleMarker(descriptor.point, { radius: 18, color: "#0f766e", weight: 3, fill: false, interactive: false });
          record.highlight = context.map.attachLayer(highlight, { band: "selection" });
          scope.defer(() => record.highlight.dispose(), { retry: "safe" });
        }
        if (state !== record || !handle.isCurrent()) { close(record); return; }
        mountPopup(record);
      } catch (error) { close(record); report(error); }
    };
    context.selection.subscribe(reconcile);
    context.rendering.subscribe(reconcile, { emitCurrent: false });
    context.contributions.popup.subscribe(reconcile, { emitCurrent: false });
    context.scope.signal.addEventListener("abort", () => close(), { once: true });
    context.scope.defer(() => close(), { retry: "safe" });
    reconcile();
  },
});
