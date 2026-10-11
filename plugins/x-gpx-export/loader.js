import { serializeGpxSource } from "../../src/gpx/serialize.js";
import { gpxDomainKey } from "../../src/domains/index.js";
import { panelServiceKey } from "../../src/plugins/contracts/panel.js";
import { statusServiceKey } from "../../src/plugins/contracts/status.js";
import { listen, node, reportError } from "../../src/ui/scoped-dom.js";
import { registerLauncher } from "../../src/ui/toolbar-launcher.js";
import { makeFileName } from "./helpers.js";

export const gpxExportPlugin = Object.freeze({
  id: "x-gpx-export",
  requires: ["tilia-gpx-domain", "tilia-panel", "tilia-toolbar"],
  setup(context, options = {}) {
    const gpx = context.domains.require(gpxDomainKey);
    const panel = context.services.require(panelServiceKey);
    const status = context.services.optional(statusServiceKey);
    const creator = options.creator ?? "Tilia";
    context.styles.use({ id: "x-gpx-export", href: new URL("./styles.css", import.meta.url).href });
    let selectedEntryId = null;
    const handles = new Set();
    const report = error => reportError(context, error);
    context.scope.defer(async () => {
      for (const handle of handles) await handle.dispose();
    }, { label: "export-panels", retry: "safe" });

    function download(container, name, text) {
      const scope = context.scope.child({ label: "gpx-download" });
      let url, anchor, timer;
      scope.defer(() => { if (url !== undefined) URL.revokeObjectURL(url); }, { label: "download-url", retry: "safe" });
      scope.defer(() => anchor?.remove(), { label: "download-anchor", retry: "safe" });
      scope.defer(() => { if (timer !== undefined) clearTimeout(timer); }, { label: "download-timer", retry: "safe" });
      try {
        url = URL.createObjectURL(new Blob([text], { type: "application/gpx+xml" }));
        scope.assertAlive();
        anchor = node(container, "a", "tilia-gpx-export-download");
        anchor.href = url; anchor.download = name; anchor.style.display = "none";
        anchor.click();
        if (scope.alive) timer = setTimeout(() => { void scope.dispose().catch(report); }, 0);
      } catch (error) {
        void scope.dispose().catch(report);
        throw error;
      }
    }

    function mount({ container, scope }) {
      const root = node(container, "div", "tilia-gpx-export-panel");
      node(root, "p", "tilia-gpx-export-intro", "Export any GPX layer to a local .gpx file.");
      const label = node(root, "label", "tilia-gpx-export-label", "Layer");
      const select = node(label, "select", "tilia-gpx-export-select");
      const button = node(root, "button", "tilia-gpx-export-action", "Export GPX"); button.type = "button";
      const message = node(root, "p", "tilia-gpx-export-message"); message.setAttribute("aria-live", "polite");
      let ids = [];
      const render = () => {
        if (!scope.alive || !context.scope.alive) return;
        const entries = context.entries.list().filter(entry => entry.domain === gpxDomainKey);
        if (!entries.some(entry => entry.id === selectedEntryId)) selectedEntryId = entries[0]?.id ?? null;
        ids = entries.map(entry => entry.id);
        select.replaceChildren();
        entries.forEach((entry, index) => {
          const item = node(select, "option", "", gpx.getDocument(entry.id).document.name || `Layer ${entry.id}`);
          item.value = String(index); item.selected = entry.id === selectedEntryId;
        });
        select.value = String(ids.indexOf(selectedEntryId));
        select.disabled = button.disabled = ids.length === 0;
      };
      const subscription = context.entries.subscribe(render, { emitCurrent: false });
      scope.defer(() => subscription.unsubscribe(), { retry: "safe" });
      listen(scope, select, "change", () => { if (context.scope.alive) selectedEntryId = ids[Number(select.value)] ?? null; }, report);
      listen(scope, button, "click", () => {
        if (!context.scope.alive) return;
        try {
          const captured = gpx.getDocument(selectedEntryId);
          const text = serializeGpxSource(captured.document, { creator });
          const name = makeFileName(captured.document.name || `track-${captured.entryId}`);
          download(root, name, text);
          if (scope.alive && context.scope.alive) {
            message.textContent = `Downloaded ${name}`;
            status?.set(`GPX export: downloaded ${name}`);
          }
        } catch (error) {
          if (scope.alive && context.scope.alive) message.textContent = error.message;
          report(error);
        }
      }, report);
      render();
    }
    registerLauncher(context, options, { kind: "action",
      label: "GPX export", iconText: "G", activate() {
        const handle = panel.toggle({ id: "gpx-export", title: "GPX Export", mount });
        if (handle?.dispose) handles.add(handle);
        return handle;
      } });
  },
});
export default gpxExportPlugin;
