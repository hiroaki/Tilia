import { createPanel, installMapControl } from "../../map/controls.js";

export async function processInputItems({
  items,
  registry,
  context,
  onStatus,
  onError,
  sourceLabel = "input",
  onItemLoaded,
}) {
  const queue = Array.from(items || []);
  if (queue.length === 0) {
    return;
  }

  try {
    let loadedCount = 0;
    let failedCount = 0;
    let lastResult = null;
    const failedDetails = [];

    for (const item of queue) {
      try {
        const result = await registry.dispatch(context, item);
        lastResult = result;
        loadedCount += 1;
        if (onItemLoaded) {
          onItemLoaded(result);
        }
      } catch (error) {
        failedCount += 1;
        failedDetails.push(`${item.name}: ${error.message}`);
        onError(error);
      }
    }

    if (loadedCount > 0 && lastResult) {
      const detailText = lastResult.summary ? ` (${lastResult.summary})` : "";
      const baseText = `Loaded ${loadedCount} file(s) from ${sourceLabel}. Total layers: ${context.state.layers.length}. Last: ${lastResult.name}${detailText}`;
      if (failedCount > 0) {
        onStatus(`${baseText}. Failed: ${failedCount}. ${failedDetails[0]}`);
      } else {
        onStatus(baseText);
      }
    } else {
      onStatus(`Failed: ${failedCount} file(s). ${failedDetails[0] || "Unknown error"}`);
    }
  } catch (error) {
    onError(error);
    onStatus(`Failed: ${error.message}`);
  }
}

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

export function installFileImportControl({ map, registry, context, onStatus, onError, onItemLoaded, position = "topleft" }) {
  let fileInput = null;

  installMapControl({
    map,
    position,
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
