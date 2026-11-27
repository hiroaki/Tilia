export function createHistory(applyOperation) {
  const undoStack = [];
  const redoStack = [];
  return {
    record(operation) {
      if (!operation) {
        return false;
      }
      undoStack.push(operation);
      redoStack.length = 0;
      return true;
    },
    undo() {
      const operation = undoStack.pop();
      if (!operation) {
        return null;
      }
      applyOperation(operation, "reverse");
      redoStack.push(operation);
      return operation;
    },
    redo() {
      const operation = redoStack.pop();
      if (!operation) {
        return null;
      }
      applyOperation(operation, "forward");
      undoStack.push(operation);
      return operation;
    },
    canUndo() {
      return undoStack.length > 0;
    },
    canRedo() {
      return redoStack.length > 0;
    },
  };
}
