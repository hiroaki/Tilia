import { createDraftDocument, toGpxSource } from "./draft.js";
import { createHistory } from "./history.js";

function editedName(name) {
  const suffix = " (edited)";
  return name.toLowerCase().endsWith(".gpx")
    ? `${name.slice(0, -4)}${suffix}.gpx`
    : `${name}${suffix}`;
}

export function createEditorSession({ scope, source, applyOperation, createEntry, report }) {
  const draft = createDraftDocument(source);
  const apply = (operation, direction) => applyOperation(draft, operation, direction);
  const history = createHistory(apply);
  let saving = null;

  return {
    scope,
    draft,
    history,
    get saving() { return saving; },
    edit(operation) {
      if (!operation || saving || !scope.alive) return false;
      apply(operation, "forward");
      return history.record(operation);
    },
    saveCopy({ tracksOnly, onSaved, onError }) {
      if (saving) return saving;
      const output = toGpxSource(draft, editedName(draft.name), { tracksOnly });
      const operation = scope.child({ label: "editor-save" });
      saving = Promise.resolve().then(async () => {
        try {
          const entry = await createEntry(output, { visible: true, signal: operation.signal });
          if (scope.alive) onSaved();
          return entry;
        } catch (error) {
          if (scope.alive) {
            saving = null;
            onError(error);
          }
        } finally {
          void operation.dispose().catch(report);
        }
      });
      operation.track(saving, { label: "save-outcome", await: false });
      return saving;
    },
  };
}
