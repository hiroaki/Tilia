import { resolveBuiltinUiOptions } from "./protocol.js";
export function registerLauncher(context, options, descriptor) {
  const { position, priority, edgePolicy, rank = 0 } = resolveBuiltinUiOptions(context.plugin.id, options);
  context.contributions.toolbar.register({ id: context.plugin.id, group: position, rank,
    descriptor: { priority, edgePolicy: edgePolicy ?? null, ...descriptor } });
}
