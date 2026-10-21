import { processInputItems } from "../../core/input-processing.js";

export function installDropzonePlugin({ dropTarget, registry, context, onStatus, onError, onItemLoaded }) {
  if (!dropTarget) {
    return;
  }

  const activeClass = "drop-active";

  const onDragOver = (event) => {
    event.preventDefault();
    dropTarget.classList.add(activeClass);
  };

  const onDragLeave = (event) => {
    // Keep highlight when moving between child elements.
    if (dropTarget.contains(event.relatedTarget)) {
      return;
    }
    dropTarget.classList.remove(activeClass);
  };

  const onDrop = async (event) => {
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
  };

  dropTarget.addEventListener("dragover", onDragOver);
  dropTarget.addEventListener("dragleave", onDragLeave);
  dropTarget.addEventListener("drop", onDrop);

  return () => {
    dropTarget.removeEventListener("dragover", onDragOver);
    dropTarget.removeEventListener("dragleave", onDragLeave);
    dropTarget.removeEventListener("drop", onDrop);
    dropTarget.classList.remove(activeClass);
  };
}
