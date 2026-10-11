import { forwardAbort } from "../../ownership/abort.js";
import { listen, node, reportError } from "../../ui/scoped-dom.js";
import { registerLauncher } from "../../ui/toolbar-launcher.js";
import { importFiles } from "./transport.js";
export default Object.freeze({
  id: "tilia-file-import", requires: ["tilia-toolbar"],
  setup(context, options = {}) {
  context.styles.use({ id: "tilia-file-input-ui", href: new URL("./file.css", import.meta.url).href });
    registerLauncher(context, options, { kind: "mount", label: "Open files", className: "tilia-file-import-control", mount({ container, scope }) {
      const report = (error) => reportError(context, error);
      const label = node(container, "label", "tilia-file-label tilia-control-button-icon", "+"); label.setAttribute("aria-label", "Open files");
      const picker = node(label, "input", ""); picker.type = "file"; picker.multiple = true; picker.setAttribute("aria-label", "Open files");
      const cancel = node(container, "button", "tilia-control-button tilia-file-cancel", "Cancel"); cancel.type = "button"; cancel.setAttribute("aria-label", "Cancel import"); cancel.hidden = true;
      const progress = node(container, "span", "tilia-file-progress"); progress.setAttribute("role", "status");
      let pending;
      const discovery = () => { if (scope.alive) picker.accept = [...new Set(context.inputs.getSnapshot().flatMap(({ discovery: d }) => [...d.extensions, ...d.mimeTypes]))].join(","); };
      const subscription = context.inputs.subscribe(discovery, { emitCurrent: false }); scope.defer(() => subscription.unsubscribe(), { retry: "safe" }); discovery();
      listen(scope, cancel, "click", () => { if (!pending) return; pending.controller.abort(); cancel.disabled = true; progress.textContent = "Cancelling…"; }, report);
      listen(scope, picker, "change", async () => {
        if (pending) return;
        const files = Object.freeze([...(picker.files ?? [])]); if (!files.length) return;
        const operation = scope.child({ label: "file-batch" }), controller = new AbortController();
        const forwarding = forwardAbort([controller.signal, operation.signal], { scope: operation });
        operation.defer(() => forwarding.dispose(), { retry: "safe" });
        const record = { operation, controller }; pending = record; picker.disabled = true; cancel.hidden = false; cancel.disabled = false; progress.textContent = "Loading…";
        try { await importFiles(context, { files, scope: operation, signal: forwarding.signal }); }
        finally {
          try { await operation.dispose(); }
          finally { if (scope.alive && pending === record) { pending = null; picker.disabled = false; picker.value = ""; cancel.hidden = true; progress.textContent = ""; } }
        }
      }, report);
    } });
  },
});
