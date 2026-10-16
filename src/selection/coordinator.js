import { createSelectionStore } from "./store.js";

export function createSelectionCoordinator(input) {
  const selection = createSelectionStore(input);
  const lifecycle = Object.freeze({
    runCommit: selection.runCommit,
    prepareDomainCommit: selection.prepareDomainCommit,
    afterLogicalRemoval(record) {
      selection.runCommit(() => selection.invalidateEntry(record.id));
    },
  });
  return Object.freeze({ selection, lifecycle });
}
