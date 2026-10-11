import { createMapControl } from "../../map/controls.js";
import { bindToolbarMount } from "../../ui/toolbar-contributions.js";
import { listen, node, reportError } from "../../ui/scoped-dom.js";
export default Object.freeze({
  id: "tilia-toolbar",
  setup(context) {
    context.styles.use({ id: "tilia-toolbar-ui", href: new URL("./toolbar.css", import.meta.url).href });
    const report = (error) => reportError(context, error), items = new Map();
    const close = (record) => {
      if (items.get(record.id) === record) items.delete(record.id);
      const operation = record.scope.dispose();
      void operation.finally(() => record.attachment?.dispose()).catch(report);
    };
    const reconcile = () => {
      if (!context.scope.alive) return;
      const snapshot = context.contributions.toolbar.getSnapshot();
      for (const record of items.values()) if (!snapshot.some((item) => item.id === record.id && item.descriptor === record.descriptor)) close(record);
      for (const item of snapshot) {
        if (items.has(item.id)) continue;
        const scope = context.scope.child({ label: `toolbar:${item.id}` }), d = item.descriptor;
        const record = { ...item, scope }; items.set(item.id, record);
        const control = createMapControl({ position: item.group, priority: d.priority, edgePolicy: d.edgePolicy,
          className: `tilia-toolbar-item ${d.className}`, createContent(container) {
            record.element = container;
            container.setAttribute("aria-label", d.label);
            bindToolbarMount(d, { container, scope });
            if (!scope.alive) return;
            if (d.kind === "mount") d.mount({ container, scope });
            else {
              const button = node(container, "button", "tilia-control-button tilia-control-button-icon", d.iconText);
              button.type = "button"; button.setAttribute("aria-label", d.label);
              listen(scope, button, "click", async () => {
                if (!scope.alive || items.get(item.id) !== record || record.pending || button.disabled) return;
                let settle; const observed = new Promise((resolve) => { settle = resolve; });
                scope.track(observed, { label: "toolbar-action", await: false });
                record.pending = true;
                try { const work = d.activate(); button.disabled = true; await work; } finally { record.pending = false; settle(); if (scope.alive && items.get(item.id) === record) button.disabled = false; }
              }, report);
            }
          } });
        try { record.attachment = context.map.mountControl(control); }
        catch (error) { close(record); report(error); }
      }
      // Leaflet inserts bottom controls in reverse order; explicitly project point order.
      for (const item of snapshot) { const element = items.get(item.id)?.element; if (element?.parentNode) element.parentNode.appendChild(element); }
    };
    context.contributions.toolbar.subscribe(reconcile, { emitCurrent: false });
    context.scope.defer(() => { for (const record of [...items.values()]) close(record); }, { retry: "safe" });
    reconcile();
  },
});
