import { createMapControl } from "../../map/controls.js";
import { panelServiceKey } from "../contracts/panel.js";
import { listen, node, reportError } from "../../ui/scoped-dom.js";
export default Object.freeze({
  id: "tilia-settings", requires: ["tilia-panel"],
  setup(context, options = {}) {
    const panel = context.services.require(panelServiceKey);
    const handles = new Set(), report = (error) => reportError(context, error);
    const control = createMapControl({ ...options, className: "tilia-settings-control", createContent(container) {
      const button = node(container, "button", "tilia-control-button tilia-control-button-icon", "S");
      button.setAttribute("aria-label", "Settings");
      listen(context.scope, button, "click", () => {
        if (panel.isOpen("settings")) return panel.close("settings");
        const handle = panel.open({ id: "settings", title: "Settings", mount({ container, scope }) {
          let rows;
          const redraw = () => {
            if (!scope.alive) return;
            void rows?.dispose().catch(report);
            rows = scope.child({ label: "settings-items" });
            container.replaceChildren();
            for (const entry of context.entries.list()) {
              for (const { descriptor } of context.contributions.settings.getSnapshot()) {
                if (!descriptor.supports(entry)) continue;
                const item = node(container, "section", "tilia-entry-settings");
                const child = rows.child({ label: `settings:${entry.id}` });
                child.defer(() => item.remove(), { retry: "safe" });
                try { descriptor.mount({ container: item, scope: child, entry }); } catch (error) { report(error); }
              }
            }
          };
          const entries = context.entries.subscribe(redraw, { emitCurrent: false });
          const contributions = context.contributions.settings.subscribe(redraw, { emitCurrent: false });
          scope.defer(() => { entries.unsubscribe(); contributions.unsubscribe(); }, { retry: "safe" });
          redraw();
        } });
        handles.add(handle);
      }, report);
    } });
    context.map.mountControl(control);
    context.scope.defer(async () => { for (const handle of handles) await handle.dispose(); }, { retry: "safe" });
  },
});
