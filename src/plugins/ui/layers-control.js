import { createMapControl } from "../../map/controls.js";
import { panelServiceKey } from "../contracts/panel.js";
import { listen, node, reportError } from "../../ui/scoped-dom.js";
export default Object.freeze({
  id: "tilia-layers", requires: ["tilia-panel"],
  setup(context, options = {}) {
    const panel = context.services.require(panelServiceKey);
    const report = (error) => reportError(context, error);
    const handles = new Set();
    const control = createMapControl({ ...options, className: "tilia-layers-control", createContent(container) {
      const button = node(container, "button", "tilia-control-button tilia-control-button-icon", "L");
      button.setAttribute("aria-label", "Layers");
      listen(context.scope, button, "click", () => {
        if (panel.isOpen("layers")) return panel.close("layers");
        const handle = panel.open({ id: "layers", title: "Layers", mount({ container, scope }) {
          let rows = null;
          const redraw = () => {
            if (!scope.alive) return;
            const old = rows;
            rows = scope.child({ label: "rows" });
            void old?.dispose().catch(report);
            container.replaceChildren();
            const list = node(container, "ul", "tilia-layer-list");
            const entries = context.entries.list();
            if (!entries.length) node(list, "li", "tilia-layer-empty", "No layers");
            for (const entry of entries) {
              const item = node(list, "li", "tilia-layer-item");
              const child = rows.child({ label: `entry:${entry.id}` });
              child.defer(() => item.remove(), { retry: "safe" });
              const toggle = node(item, "input", "tilia-layer-visible");
              toggle.type = "checkbox"; toggle.checked = entry.visible;
              toggle.setAttribute("aria-label", `Show entry ${entry.id}`);
              listen(child, toggle, "change", () => context.entries.setVisible(entry.id, toggle.checked), report);
              const content = node(item, "div", "tilia-layer-card-body");
              const adapter = context.contributions.layers.get(entry.domain);
              if (adapter) {
                const adapterScope = child.child({ label: "layers-adapter" });
                const adapterContainer = node(content, "div", "tilia-layer-adapter");
                adapterScope.defer(() => adapterContainer.remove(), { retry: "safe" });
                try { adapter.mount({ container: adapterContainer, scope: adapterScope, entry }); }
                catch (error) {
                  report(error);
                  adapterContainer.remove();
                  void adapterScope.dispose().catch(report);
                  node(content, "div", "tilia-layer-name", `${entry.domain.id} ${entry.id}`);
                }
              } else node(content, "div", "tilia-layer-name", `${entry.domain.id} ${entry.id}`);
              const remove = node(item, "button", "tilia-layer-delete-button", "Remove");
              listen(child, remove, "click", () => context.entries.remove(entry.id), report);
            }
          };
          const entries = context.entries.subscribe(redraw, { emitCurrent: false });
          const adapters = context.contributions.layers.subscribe(redraw, { emitCurrent: false });
          scope.defer(() => { entries.unsubscribe(); adapters.unsubscribe(); }, { retry: "safe" });
          redraw();
        } });
        handles.add(handle);
      }, report);
    } });
    context.map.mountControl(control);
    context.scope.defer(async () => { for (const handle of handles) await handle.dispose(); }, { retry: "safe" });
  },
});
