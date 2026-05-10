import { processInputItems } from "./file-import.js";

export function installDropzonePlugin({ dropTarget, registry, context, onStatus, onError, onItemLoaded }) {
  if (!dropTarget) {
    return;
  }

  const activeClass = "drop-active";

  dropTarget.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropTarget.classList.add(activeClass);
  });

  dropTarget.addEventListener("dragleave", (event) => {
    // Keep highlight when moving between child elements.
    if (dropTarget.contains(event.relatedTarget)) {
      return;
    }
    dropTarget.classList.remove(activeClass);
  });

  dropTarget.addEventListener("drop", async (event) => {
    event.preventDefault();
    dropTarget.classList.remove(activeClass);

    const files = Array.from(event.dataTransfer?.files || []);
    await processInputItems({
      items: files,
      registry,
      context,
      onStatus,
      onError,
      sourceLabel: "drop",
      onItemLoaded,
    });
  });
}
