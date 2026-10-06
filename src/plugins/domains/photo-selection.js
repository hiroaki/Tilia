import { semanticError, semanticErrorCodes } from "../../domains/errors.js";

function validate(ref) {
  if (!ref || ref.kind !== "photo" || Object.keys(ref).length !== 1) {
    throw semanticError(semanticErrorCodes.selectionReferenceInvalid, "Invalid Photo semantic selection reference", { domainId: "photo" });
  }
}

export function createPhotoSelectionAdapter() {
  const canonical = Object.freeze({ kind: "photo" });
  return Object.freeze({
    canonicalize({ target }) { validate(target); return canonical; },
    equals(left, right) { validate(left); validate(right); return true; },
    resolve({ instance, ref }) { validate(ref); return instance.publicSnapshot; },
    reconcile({ previousRevision, nextRevision }) {
      return Object.freeze({ type: previousRevision === nextRevision ? "unchanged" : "refreshed" });
    },
  });
}
