import { createPanel, installMapControl } from "../../map/controls.js";
import { processInputItems } from "../../core/input-processing.js";

export function installFileImportPlugin({ fileInput, registry, context, onStatus, onError, onItemLoaded }) {
  fileInput?.addEventListener("change", async (event) => {
    const target = event.target;
    const files = Array.from(target.files || []);

    await processInputItems({
      items: files,
      registry,
      context,
      onStatus,
      onError,
      sourceLabel: "file",
      onItemLoaded,
    });

    target.value = "";
  });
}

export function installFileImportControl({ map, registry, context, onStatus, onError, onItemLoaded, position = "topleft", priority = "normal" }) {
  let fileInput = null;

  installMapControl({
    map,
    position,
    priority,
    className: "tilia-file-import-control",
    createContent() {
      const panel = createPanel("tilia-control-panel-compact");
      const label = document.createElement("label");
      label.className = "tilia-file-label tilia-control-button-icon";
      label.textContent = "+";
      label.title = "Open GPX or JPEG files";
      label.setAttribute("aria-label", "Open GPX or JPEG files");

      fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.multiple = true;
      fileInput.accept = ".gpx,application/gpx+xml,application/xml,text/xml,image/jpeg,.jpg,.jpeg";
      label.appendChild(fileInput);
      panel.appendChild(label);

      installFileImportPlugin({
        fileInput,
        registry,
        context,
        onStatus,
        onError,
        onItemLoaded,
      });

      return panel;
    },
  });

  return {
    getInput() {
      return fileInput;
    },
  };
}
