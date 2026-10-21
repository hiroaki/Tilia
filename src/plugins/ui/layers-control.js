import { statusServiceKey } from "../contracts/status.js";
import { panelServiceKey } from "../contracts/panel.js";
import { listen, node, reportError } from "../../ui/scoped-dom.js";
import { registerLauncher } from "../../ui/toolbar-launcher.js";
export default Object.freeze({
  id: "tilia-layers", requires: ["tilia-panel", "tilia-toolbar"],
  setup(context, options = {}) {
    context.styles.use({ id: "tilia-layers-ui", href: new URL("./layers.css", import.meta.url).href });
    const panel = context.services.require(panelServiceKey), report = (e) => reportError(context, e), handles = new Set();
    registerLauncher(context, options, { kind: "action", label: "Layers", iconText: "L", className: "tilia-layers-control", activate() {
      if (panel.isOpen("layers")) return panel.close("layers");
      handles.add(panel.open({ id: "layers", title: "Layers", layout: "side", mount({ container, scope }) {
        container.classList.add("tilia-layers-panel-content");
        node(container, "p", "tilia-layers-panel-text", "Layers panel: show or hide layers and inspect their contents.");
        const mutations = node(container, "fieldset", "tilia-layer-mutations");
        const clear = node(mutations, "button", "tilia-control-button tilia-layer-clear-button", "Delete all"); clear.type = "button";
        const list = node(mutations, "ul", "tilia-layer-list"), rows = new Map();
        let empty;
        const withdraw = (row) => { if (rows.get(row.id) === row) rows.delete(row.id); row.item.remove(); void row.scope.dispose().catch(report); };
        const present = (row) => { if (!scope.alive || !row.scope.alive) return false; if (!context.entries.get(row.id)) { withdraw(row); return false; } return true; };
        const selection = () => { if (!scope.alive) return; const current = context.selection.getCurrent(); for (const row of rows.values()) row.item.classList.toggle("tilia-layer-selected", current?.entryId === row.id); };
        const reconcile = () => {
          if (!scope.alive) return;
          const entries = context.entries.list();
          for (const row of [...rows.values()]) if (!entries.some((e) => e.id === row.id)) withdraw(row);
          for (const [index, entry] of entries.entries()) {
            let row = rows.get(entry.id);
            if (!row) {
              const child = scope.child({ label: `entry:${entry.id}` }), item = node(list, "li", "tilia-layer-item tilia-layer-card");
              row = { id: entry.id, scope: child, item }; rows.set(entry.id, row); child.defer(() => item.remove(), { retry: "safe" });
              row.toggle = node(item, "input", "tilia-layer-visible"); row.toggle.type = "checkbox"; row.toggle.setAttribute("aria-label", `Show entry ${entry.id}`);
              row.content = node(item, "div", "tilia-layer-card-body");
              const captured = row;
              listen(child, row.toggle, "change", async () => {
                if (!present(captured)) return;
                const wasVisible = context.entries.get(entry.id).visible;
                const visible = captured.toggle.checked;
                try {
                  await context.entries.setVisible(entry.id, visible);
                  if (present(captured) && !visible && wasVisible && !context.entries.get(entry.id).visible) {
                    const selected = context.selection.getCurrent();
                    if (selected?.entryId === entry.id) await context.selection.clear({ ifCurrent: selected });
                  }
                } finally { if (present(captured)) captured.toggle.checked = context.entries.get(entry.id).visible; }
              }, report);
              const remove = node(item, "button", "tilia-control-button tilia-layer-delete-button", "×"); remove.type = "button";
              remove.setAttribute("aria-label", "Remove"); remove.title = `Remove entry ${entry.id}`;
              listen(child, remove, "click", async () => { if (!present(captured) || remove.disabled) return; remove.disabled = true; try { await context.entries.remove(entry.id); } finally { if (present(captured)) remove.disabled = false; } }, report);
            }
            row.toggle.checked = entry.visible;
            const adapter = context.contributions.layers.get(entry.domain);
            if (!row.projected || row.adapter !== adapter) {
              row.projected = true; row.adapter = adapter;
              void row.adapterScope?.dispose().catch(report);
              row.content.replaceChildren();
              if (adapter) {
                const child = row.scope.child({ label: "adapter" }), assigned = node(row.content, "div", "tilia-layer-adapter"); row.adapterScope = child;
                child.defer(() => assigned.remove(), { retry: "safe" });
                try { adapter.mount({ container: assigned, scope: child, entry, withdraw: () => withdraw(row) }); }
                catch (error) { report(error); assigned.remove(); void child.dispose().catch(report); node(row.content, "div", "tilia-layer-name", `${entry.domain.id} ${entry.id}`); }
              } else node(row.content, "div", "tilia-layer-name", `${entry.domain.id} ${entry.id}`);
            }
            const position = list.children[index];
            if (position !== row.item) list.insertBefore(row.item, position ?? null);
          }
          if (entries.length) { empty?.remove(); empty = null; }
          else if (!empty) empty = node(list, "li", "tilia-layer-empty", "No layers");
          selection();
        };
        listen(scope, clear, "click", async () => { if (clear.disabled) return; clear.disabled = true; mutations.disabled = true; try { await context.entries.clear(); if (scope.alive) context.services.optional(statusServiceKey)?.set("Cleared all layers and sources"); } finally { if (scope.alive) { clear.disabled = false; mutations.disabled = false; reconcile(); } } }, report);
        const subscriptions = [context.entries.subscribe(reconcile, { emitCurrent: false }), context.contributions.layers.subscribe(reconcile, { emitCurrent: false }), context.selection.subscribe(selection)];
        scope.defer(() => subscriptions.forEach((s) => s.unsubscribe()), { retry: "safe" }); reconcile();
      } }));
    } });
    context.scope.defer(async () => { for (const handle of handles) await handle.dispose(); }, { retry: "safe" });
  },
});
