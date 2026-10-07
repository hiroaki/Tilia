import { extensionError, extensionErrorCodes } from "../../extensions/errors.js";
export function createPluginContext({
  pluginId,
  scope,
  stage,
  enqueuePostCommit,
  addTeardownPreflight,
  isInstalling = () => false,
  isActive = () => false,
  diagnostics,
  capabilityFactories = {},
}) {
  const context = {
    plugin: Object.freeze({ id: pluginId }),
    scope,
    lifecycle: Object.freeze({
      afterCommit(callback) {
        scope.assertAlive();
        if (typeof callback !== "function") throw new TypeError("afterCommit requires a function");
        if (!isInstalling()) throw extensionError(extensionErrorCodes.unavailable, "afterCommit is setup-only");
        let pending = true;
        const cancel = () => { pending = false; };
        scope.defer(cancel, { label: "after-commit", retry: "safe" });
        enqueuePostCommit(() => {
          if (!pending || !scope.alive || !isActive()) return;
          pending = false;
          try {
            const result = callback();
            if (result?.then) {
              void Promise.resolve(result).catch((error) => diagnostics?.report?.(error));
              diagnostics?.report?.(new TypeError("afterCommit callback must return void"));
            }
          } catch (error) { diagnostics?.report?.(error); }
        });
        return Object.freeze({ cancel });
      },
    }),
  };
  for (const [name, factory] of Object.entries(capabilityFactories)) {
    if (typeof factory !== "function" || name in context) {
      throw new TypeError(`Invalid PluginContext capability factory "${name}"`);
    }
    context[name] = Object.freeze(factory({
      pluginId,
      scope,
      stage,
      enqueuePostCommit,
      addTeardownPreflight,
      isInstalling,
      isActive,
      diagnostics,
    }));
  }
  return Object.freeze(context);
}
