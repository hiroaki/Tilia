import { pluginError, pluginErrorCodes } from "./errors.js";

export function planDependencies(rootId, metadataById, activeIds = new Set()) {
  const states = new Map();
  const stack = [];
  const order = [];
  const edges = new Map();

  function visit(id, path) {
    if (activeIds.has(id)) return;
    const state = states.get(id);
    if (state === "visited") return;
    if (state === "visiting") {
      const start = stack.indexOf(id);
      const cycle = [...stack.slice(start), id];
      throw pluginError(pluginErrorCodes.dependencyCycle, `Plugin dependency cycle: ${cycle.join(" -> ")}`, { pluginId: rootId, cycle });
    }
    const metadata = metadataById.get(id);
    if (!metadata) {
      throw pluginError(pluginErrorCodes.dependencyMissing, `Missing plugin dependency "${id}"`, { pluginId: rootId, dependencyId: id, path: [...path, id] });
    }
    states.set(id, "visiting");
    stack.push(id);
    edges.set(id, metadata.requires);
    for (const dependencyId of metadata.requires) visit(dependencyId, [...path, id]);
    stack.pop();
    states.set(id, "visited");
    order.push(id);
  }

  visit(rootId, []);
  return Object.freeze({
    order: Object.freeze(order),
    edges: Object.freeze(Object.fromEntries([...edges].map(([id, requires]) => [id, Object.freeze([...requires])]))),
  });
}
