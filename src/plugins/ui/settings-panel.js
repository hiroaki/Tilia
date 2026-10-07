import { panelServiceKey } from "../contracts/panel.js";
import { node, reportError } from "../../ui/scoped-dom.js";
import { registerLauncher } from "../../ui/toolbar-launcher.js";
export default Object.freeze({
  id: "tilia-settings", requires: ["tilia-panel", "tilia-toolbar"],
  setup(context, options = {}) {
    context.styles.use({ id: "tilia-settings-ui", href: new URL("./settings.css", import.meta.url).href });
    const panel = context.services.require(panelServiceKey), handles = new Set(), report = (e) => reportError(context, e);
    registerLauncher(context, options, { kind: "action", label: "Settings", iconText: "S", className: "tilia-settings-control", activate() {
      if (panel.isOpen("settings")) return panel.close("settings");
      handles.add(panel.open({ id: "settings", title: "Settings", layout: "side", mount({ container, scope }) {
        const records = new Map();
        const close = (record) => { if (records.get(record.key) === record) records.delete(record.key); record.item.remove(); void record.scope.dispose().catch(report); };
        const reconcile = () => {
          if (!scope.alive) return;
          const desired = new Set();
          for (const entry of context.entries.list()) for (const { id, descriptor } of context.contributions.settings.getSnapshot()) {
            let supported = false;
            try { supported = descriptor.supports(entry); } catch (error) { report(error); }
            if (!supported) continue;
            const key = JSON.stringify([entry.id, id]); desired.add(key);
            let record = records.get(key);
            if (record && record.descriptor !== descriptor) { close(record); record = null; }
            if (!record) {
              const child = scope.child({ label: `settings:${key}` }), item = node(container, "section", "tilia-entry-settings");
              record = { key, descriptor, scope: child, item }; records.set(key, record); child.defer(() => item.remove(), { retry: "safe" });
              const captured = record;
              try { descriptor.mount({ container: item, scope: child, entry, withdraw: () => close(captured) }); }
              catch (error) { report(error); close(record); }
            }
            if (records.get(key) === record) container.appendChild(record.item);
          }
          for (const record of [...records.values()]) if (!desired.has(record.key)) close(record);
        };
        const subscriptions = [context.entries.subscribe(reconcile, { emitCurrent: false }), context.contributions.settings.subscribe(reconcile, { emitCurrent: false })];
        scope.defer(() => subscriptions.forEach((s) => s.unsubscribe()), { retry: "safe" }); reconcile();
      } }));
    } });
    context.scope.defer(async () => { for (const handle of handles) await handle.dispose(); }, { retry: "safe" });
  },
});
