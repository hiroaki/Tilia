import { createContributionPoint } from "../extensions/contributions.js";
import { extensionError, extensionErrorCodes } from "../extensions/errors.js";
import { guardedMount } from "./contribution-mount.js";

const mounts = new WeakMap();
const groups = ["topleft", "topright", "bottomleft", "bottomright"];
const invalid = () => { throw extensionError(extensionErrorCodes.contributionInvalid, "Invalid Toolbar contribution"); };
export function createToolbarPoint(onError) {
  const point = createContributionPoint({ id: "toolbar", groups, onError });
  return (input) => {
    const facade = point.createFacade(input);
    return Object.freeze({ ...facade, register(value) {
      input.scope.assertAlive();
      if (!value || typeof value !== "object" || Array.isArray(value)
          || Reflect.ownKeys(value).some((k) => !["id", "group", "rank", "descriptor"].includes(k))) invalid();
      const { id, group = "topleft", rank = 0, descriptor: d } = value;
      if (typeof id !== "string" || !id.trim() || id.trim() !== id || !groups.includes(group) || !Number.isFinite(rank)
          || !d || typeof d !== "object" || Array.isArray(d)) invalid();
      const action = d.kind === "action";
      const allowed = ["kind", "label", "className", "priority", "edgePolicy", ...(action ? ["iconText", "activate"] : ["mount"])];
      if (!["action", "mount"].includes(d.kind) || Reflect.ownKeys(d).some((k) => !allowed.includes(k))
          || typeof d.label !== "string" || !d.label.trim() || d.label !== d.label.trim()
          || (d.iconText !== undefined && typeof d.iconText !== "string")
          || (d.className !== undefined && (typeof d.className !== "string" || !d.className.split(/\s+/).filter(Boolean).every((s) => /^[A-Za-z_][A-Za-z0-9_-]*$/.test(s))))
          || !["low", "normal", "high"].includes(d.priority === undefined ? "normal" : d.priority)
          || ![null, "keep", "yield"].includes(d.edgePolicy ?? null)
          || typeof d[action ? "activate" : "mount"] !== "function") invalid();
      const activate = d.activate, mount = d.mount;
      const invoke = action ? () => { input.scope.assertAlive(); return activate(); } : guardedMount(input.scope, (mountInput) => {
        const result = mount(mountInput);
        if (result?.then) { void Promise.resolve(result).catch(onError); throw new TypeError("Toolbar mount must be synchronous"); }
      }, onError);
      if (action) mounts.set(invoke, guardedMount(input.scope, () => {}, onError));
      facade.register({ id, group, rank, descriptor: { kind: d.kind, label: d.label,
        className: d.className ?? "", priority: d.priority ?? "normal", edgePolicy: d.edgePolicy ?? null,
        ...(action ? { iconText: d.iconText ?? d.label, activate: invoke } : { mount: invoke }) } });
    } });
  };
}
// Internal host/contributor resource close join; no extra public descriptor fields.
export function bindToolbarMount(descriptor, input) {
  mounts.get(descriptor.kind === "action" ? descriptor.activate : descriptor.mount)?.(input);
}
