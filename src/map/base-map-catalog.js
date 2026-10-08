import { extensionError, extensionErrorCodes } from "../extensions/errors.js";
import { createSubscriptionChannel } from "../extensions/subscriptions.js";

function normalize(definition) {
  if (!definition || typeof definition.id !== "string"
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(definition.id)
      || typeof definition.createLayer !== "function") {
    throw extensionError(extensionErrorCodes.baseMapInvalid, "Base-map providers require id and createLayer()");
  }
  return Object.freeze({
    id: definition.id,
    label: definition.label || definition.id,
    provider: definition.provider || "custom",
    category: definition.category || "general",
    rank: Number.isFinite(definition.rank) ? definition.rank : 0,
    visibleInSelector: definition.visibleInSelector !== false,
    isDefault: definition.isDefault === true,
  });
}

export function createBaseMapCatalog({ map, scope = null, onError = () => {} }) {
  const providers = new Map();
  const pending = new Map();
  let terminal = false;
  const retiring = new Set();
  scope?.defer(() => {
    terminal = true;
    if (selectedLayer) retiring.add(selectedLayer);
    selected = selectedLayer = null;
    const failures = [];
    for (const layer of [...retiring]) { try { layer.remove(); retiring.delete(layer); } catch (error) { failures.push(error); } }
    if (failures.length) throw new AggregateError(failures, "Base layer cleanup failed");
  }, { label: "base-map-layers", retry: "safe" });
  function removeLayer(layer) {
    if (!layer) return;
    retiring.add(layer);
    layer.remove();
    retiring.delete(layer);
  }
  let selected = null;
  let selectedLayer = null;
  const channel = createSubscriptionChannel({ getSnapshot, onError });

  function liveProviders(exclude = null) {
    return [...providers.values()].filter((record) => record !== exclude && record.owner.alive)
      .sort((a, b) => a.metadata.rank - b.metadata.rank || a.metadata.id.localeCompare(b.metadata.id));
  }
  function getSnapshot() {
    return Object.freeze({
      providers: Object.freeze(liveProviders().map(({ metadata }) => metadata)),
      selected: selected?.owner.alive ? selected.metadata : null,
    });
  }
  function replace(record) {
    if (terminal) return null;
    let layer;
    try {
      layer = record.factory();
      if (terminal) throw new Error("Base-map acquisition cancelled");
      retiring.add(layer);
      layer.addTo(map);
      if (terminal) throw new Error("Base-map acquisition cancelled");
    } catch (cause) {
      try { removeLayer(layer); } catch (error) { onError(error); }
      throw extensionError(extensionErrorCodes.baseMapSelectionFailed, `Failed to select base map "${record.metadata.id}"`, { cause, providerId: record.metadata.id });
    }
    const previous = selectedLayer;
    selected = record;
    selectedLayer = layer;
    retiring.delete(layer);
    if (previous !== layer) removeLayer(previous);
    channel.deliver(getSnapshot());
    return record.metadata;
  }
  function select(id) {
    const record = providers.get(id);
    if (!record?.owner.alive) throw extensionError(extensionErrorCodes.baseMapUnknown, `Unknown base map "${id}"`, { providerId: id });
    if (selected === record && selectedLayer) return record.metadata;
    return replace(record);
  }
  function remove(record) {
    if (providers.get(record.metadata.id) === record) providers.delete(record.metadata.id);
    if (selected !== record) { channel.deliver(getSnapshot()); return; }
    selected = null;
    const departingLayer = selectedLayer;
    selectedLayer = null;
    const candidates = liveProviders(record);
    const defaults = candidates.filter(({ metadata }) => metadata.isDefault);
    const attempts = terminal ? [] : [...defaults, ...candidates.filter((candidate) => !defaults.includes(candidate))];
    for (const candidate of attempts) {
      try {
        replace(candidate);
        removeLayer(departingLayer);
        return;
      } catch (error) {
        onError(error);
      }
    }
    removeLayer(departingLayer);
    channel.deliver(getSnapshot());
  }

  function createFacade({ scope, stage, enqueuePostCommit }) {
    return Object.freeze({
      register(definition) {
        scope.assertAlive();
        const metadata = normalize(definition);
        const record = { metadata, factory: definition.createLayer, owner: scope };
        if (!pending.has(metadata.id)) pending.set(metadata.id, new Set());
        pending.get(metadata.id).add(record);
        stage({
          label: `base-map:${metadata.id}`,
          preflight() {
            if (providers.get(metadata.id)?.owner.alive || [...pending.get(metadata.id)].some((candidate) => candidate !== record && candidate.owner.alive)) {
              throw extensionError(extensionErrorCodes.baseMapDuplicate, `Base map "${metadata.id}" already exists`, { providerId: metadata.id });
            }
          },
          commit() {
            providers.set(metadata.id, record);
            enqueuePostCommit(() => {
              channel.deliver(getSnapshot());
              if (!terminal && !selected && (metadata.isDefault || liveProviders()[0] === record)) {
                try { replace(record); } catch (error) { onError(error); }
              }
            });
          },
          dispose({ committed }) {
            pending.get(metadata.id)?.delete(record);
            if (pending.get(metadata.id)?.size === 0) pending.delete(metadata.id);
            if (committed) remove(record);
          },
          retry: "safe",
        });
      },
      list() { scope.assertAlive(); return getSnapshot().providers; },
      get(id) { scope.assertAlive(); return getSnapshot().providers.find((item) => item.id === id) || null; },
      getSelected() { scope.assertAlive(); return getSnapshot().selected; },
      select(id) { scope.assertAlive(); return select(id); },
      subscribe(listener, options) { return channel.subscribe(scope, listener, options); },
    });
  }

  return Object.freeze({ createFacade, getSnapshot, getSelectedLayer: () => selectedLayer, beginShutdown() { terminal = true; } });
}
