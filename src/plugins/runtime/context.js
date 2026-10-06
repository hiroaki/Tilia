export function createPluginContext({ pluginId, scope, stage, capabilityFactories = {} }) {
  const context = {
    plugin: Object.freeze({ id: pluginId }),
    scope,
  };
  for (const [name, factory] of Object.entries(capabilityFactories)) {
    if (typeof factory !== "function" || name in context) {
      throw new TypeError(`Invalid PluginContext capability factory "${name}"`);
    }
    context[name] = Object.freeze(factory({ pluginId, scope, stage }));
  }
  return Object.freeze(context);
}
