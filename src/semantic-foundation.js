import { createScopeController } from "./ownership/index.js";
import { createDomainRegistry } from "./domains/index.js";
import { createEntryStore } from "./entries/index.js";
import { createSelectionCoordinator } from "./selection/index.js";

export async function createSemanticFoundation({ onError = () => {} } = {}) {
  const controller = createScopeController({ label: "application-semantic-root" });
  await controller.commit();
  const domains = createDomainRegistry({ onError });
  const coordinator = createSelectionCoordinator({
    applicationScope: controller.scope,
    getTarget: (id, key) => entries.getSemanticTarget(id, key),
    onError,
  });
  const entries = createEntryStore({
    applicationController: controller, domainRegistry: domains,
    semanticLifecycle: coordinator.lifecycle, onError,
  });
  return Object.freeze({
    domains,
    entries,
    selection: coordinator.selection,
    scope: controller.scope,
    inspect() {
      return Object.freeze({ domains: domains.inspect(), entries: entries.inspect(), ownership: controller.snapshot() });
    },
    async dispose() {
      const entryDiagnostics = entries.inspect();
      if (entryDiagnostics.entries.length > 0 || entryDiagnostics.residuals.length > 0) {
        throw new Error("Semantic foundation cannot close before all entry scopes are disposed");
      }
      coordinator.selection.terminate();
      await controller.close();
    },
  });
}
