import { createMapControl } from "../../map/controls.js";
import { statusServiceKey } from "../contracts/status.js";
import { listen, node, reportError } from "../../ui/scoped-dom.js";
export default Object.freeze({
  id: "tilia-file-import",
  setup(context, options = {}) {
    const status = (text) => context.services.optional(statusServiceKey)?.set(text);
    const report = (error) => reportError(context, error);
    let fileInput;
    const control = createMapControl({ ...options, className: "tilia-file-import-control", createContent(container) {
      const label = node(container, "label", "tilia-file-label tilia-control-button-icon", "+");
      label.setAttribute("aria-label", "Open files");
      fileInput = node(label, "input", ""); fileInput.type = "file"; fileInput.multiple = true;
      const discovery = () => {
        fileInput.accept = [...new Set(context.inputs.getSnapshot().flatMap(({ discovery }) =>
          [...discovery.extensions, ...discovery.mimeTypes]))].join(",");
      };
      context.inputs.subscribe(discovery);
      listen(context.scope, fileInput, "change", async () => {
        const files = [...fileInput.files];
        let loaded = 0;
        const details = [];
        try {
          for (const file of files) {
            if (!context.scope.alive) break;
            try {
              const result = await context.inputs.dispatch(file);
              if (!context.scope.alive) break;
              loaded++;
              details.push(`${result?.name ?? file.name}${result?.locationSource ? ` (${result.locationSource})` : ""}`);
            } catch (error) {
              report(error); details.push(`${file.name}: ${error.message}`);
            }
          }
          if (context.scope.alive) status(`Loaded ${loaded} file(s) from file. ${details.join("; ")}`);
        } finally { fileInput.value = ""; }
      }, report);
      return label;
    } });
    context.map.mountControl(control);
  },
});
