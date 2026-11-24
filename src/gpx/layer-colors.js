import { scopeIsOperational } from "../ownership/scope.js";

const targetKey = target => target.kind === "track" ? `track:${target.trackIndex}` : `route:${target.routeIndex}`;

export function createGpxLayerColors({ scope, entries, rendering }) {
  const overrides = new Map();
  const generations = new Map();
  const clear = () => { overrides.clear(); generations.clear(); };
  scope.signal.addEventListener("abort", clear, { once: true });

  entries.subscribe((event) => {
    if (event.type === "removed") overrides.delete(event.previous.id);
    if (event.type === "cleared") for (const entry of event.removed) overrides.delete(entry.id);
    if (event.type === "domain-changed" && ["replace-data", "set-style-preset"].includes(event.change.type)) {
      overrides.delete(event.entry.id);
    }
  }, { emitCurrent: false });

  function current(entryId, target) {
    const status = rendering.getStatus(entryId);
    if (status?.state !== "active" || !status.visible || status.currentRevision !== status.semanticRevision) return null;
    const generation = generations.get(entryId)?.get(status.currentToken);
    const drawable = generation?.targets.get(targetKey(target));
    if (!drawable?.paint.length || !generation.input.currency.isCurrent() || !generation.input.visibility.isVisible(target)) return null;
    return { token: status.currentToken, drawable };
  }

  return {
    get(entryId, target) {
      const active = current(entryId, target);
      return {
        color: active?.drawable.color,
        override: overrides.get(entryId)?.get(targetKey(target)),
        token: active?.token,
      };
    },
    set(entryId, target, token, color) {
      if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) return false;
      const active = current(entryId, target);
      if (!active || active.token !== token) return false;
      const { drawable } = active;
      const normalized = color.toLowerCase();
      if (normalized === drawable.color) return true;
      for (const paint of drawable.paint) {
        if (current(entryId, target)?.drawable !== drawable) return false;
        paint(normalized);
      }
      if (current(entryId, target)?.drawable !== drawable) return false;
      drawable.color = normalized;
      if (!overrides.has(entryId)) overrides.set(entryId, new Map());
      overrides.get(entryId).set(targetKey(target), normalized);
      return true;
    },
    begin(input) {
      const { entryId, currency: { token } } = input;
      const records = generations.get(entryId) ?? new Map();
      const targets = new Map();
      input.scope.defer(() => {
        records.delete(token);
        if (generations.get(entryId) === records && !records.size) generations.delete(entryId);
        if (scopeIsOperational(scope) && !entries.get(entryId)) overrides.delete(entryId);
      }, { retry: "safe" });
      records.set(token, { input, targets });
      generations.set(entryId, records);
      return (target, baseColor) => {
        const key = targetKey(target);
        const drawable = { color: overrides.get(entryId)?.get(key) ?? baseColor, paint: [] };
        targets.set(key, drawable);
        return drawable;
      };
    },
  };
}
