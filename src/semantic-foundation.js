import { createScopeController } from "./ownership/index.js";
import { createDomainRegistry } from "./domains/index.js";
import { createEntryStore } from "./entries/index.js";

export async function createSemanticFoundation({ onError = () => {} } = {}) {
  const controller = createScopeController({ label: "application-semantic-root" });
  await controller.commit();
  const domains = createDomainRegistry({ onError });
  const entries = createEntryStore({ applicationScope: controller.scope, domainRegistry: domains, onError });
  return Object.freeze({
    domains,
    entries,
    scope: controller.scope,
    inspect() {
      return Object.freeze({ domains: domains.inspect(), entries: entries.inspect(), ownership: controller.snapshot() });
    },
    async dispose() {
      const entryDiagnostics = entries.inspect();
      if (entryDiagnostics.entries.length > 0 || entryDiagnostics.residuals.length > 0) {
        throw new Error("Semantic foundation cannot close before all entry scopes are disposed");
      }
      await controller.close();
    },
  });
}
