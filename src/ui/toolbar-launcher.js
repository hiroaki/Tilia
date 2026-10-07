import { resolveBuiltinUiOptions } from "./protocol.js";
export function registerLauncher(context, options, descriptor) {
  const { position, priority, edgePolicy } = resolveBuiltinUiOptions(context.plugin.id, options);
  context.contributions.toolbar.register({ id: context.plugin.id, group: position, rank: options?.rank ?? 0,
    descriptor: { priority, edgePolicy: edgePolicy ?? null, ...descriptor } });
}
